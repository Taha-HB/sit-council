const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { protect } = require('../middleware/auth');
const Meeting = require('../models/Meeting');
const User = require('../models/User');

// Generate PDF for meeting minutes
router.get('/generate/:meetingId', protect, async (req, res) => {
    try {
        const meetingId = req.params.meetingId;
        
        // Find meeting
        const meeting = await Meeting.findById(meetingId)
            .populate('chairperson', 'name role')
            .populate('minutesTaker', 'name role')
            .populate('attendees.user', 'name role')
            .populate('minutes.actionItems.assignee', 'name');
        
        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found'
            });
        }

        // Check permission
        if (meeting.createdBy.toString() !== req.user.id && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this meeting'
            });
        }

        // Create PDF document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            font: 'Times-Roman'
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="SIT-Meeting-${meetingId}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Add SBC Logo (placeholder)
        doc.image('public/assets/logo.png', 50, 45, { width: 100 })
           .fillColor('#000000');

        // Header
        doc.fontSize(24)
           .text('SIT STUDENT COUNCIL', 200, 50, { align: 'center' })
           .fontSize(16)
           .text('OFFICIAL MEETING MINUTES', 200, 80, { align: 'center' })
           .moveDown();

        // Meeting Details Section
        doc.fontSize(14)
           .text('MEETING DETAILS', { underline: true })
           .moveDown(0.5);

        doc.fontSize(12)
           .text(`Title: ${meeting.title}`, { continued: true })
           .text(`Date: ${formatDate(meeting.date)}`, { align: 'right' })
           .moveDown(0.5);

        doc.text(`Type: ${meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1)}`, { continued: true })
           .text(`Time: ${meeting.startTime} - ${meeting.endTime}`, { align: 'right' })
           .moveDown(0.5);

        doc.text(`Location: ${meeting.location || 'Not specified'}`, { continued: true })
           .text(`Status: ${meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}`, { align: 'right' })
           .moveDown(0.5);

        doc.text(`Chairperson: ${meeting.chairperson?.name || 'Not specified'}`, { continued: true })
           .text(`Minutes Taker: ${meeting.minutesTaker?.name || 'Not specified'}`, { align: 'right' })
           .moveDown();

        // Objectives
        if (meeting.objective) {
            doc.fontSize(14)
               .text('MEETING OBJECTIVES', { underline: true })
               .moveDown(0.5);

            doc.fontSize(12)
               .text(meeting.objective)
               .moveDown();
        }

        // Attendees Section
        doc.addPage()
           .fontSize(14)
           .text('ATTENDEES', { underline: true })
           .moveDown(0.5);

        const attendees = meeting.attendees || [];
        attendees.forEach((attendee, index) => {
            const status = attendee.status || 'pending';
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            
            doc.fontSize(12)
               .text(`${index + 1}. ${attendee.user?.name || 'Unknown'} - ${attendee.user?.role || 'Member'}`, { continued: true })
               .text(`(${statusText})`, { align: 'right' })
               .moveDown(0.5);
        });

        // Agenda Items
        if (meeting.agenda && meeting.agenda.length > 0) {
            doc.addPage()
               .fontSize(14)
               .text('AGENDA ITEMS', { underline: true })
               .moveDown(0.5);

            meeting.agenda.forEach((item, index) => {
                doc.fontSize(12)
                   .text(`${index + 1}. ${item.title}`, { indent: 20 })
                   .fontSize(10)
                   .text(`Presenter: ${item.presenter || 'Not specified'} | Duration: ${item.duration || 15} mins | Status: ${item.status || 'pending'}`)
                   .moveDown(0.5);

                if (item.description) {
                    doc.fontSize(10)
                       .text(`Description: ${item.description}`, { indent: 40 })
                       .moveDown(0.5);
                }
            });
        }

        // Minutes Section
        if (meeting.minutes) {
            doc.addPage()
               .fontSize(14)
               .text('MEETING MINUTES', { underline: true })
               .moveDown(0.5);

            // Summary
            if (meeting.minutes.summary) {
                doc.fontSize(12)
                   .text('Summary:')
                   .fontSize(11)
                   .text(meeting.minutes.summary, { indent: 20 })
                   .moveDown();
            }

            // Decisions
            if (meeting.minutes.decisions && meeting.minutes.decisions.length > 0) {
                doc.fontSize(12)
                   .text('Decisions Made:')
                   .moveDown(0.5);

                meeting.minutes.decisions.forEach((decision, index) => {
                    doc.fontSize(11)
                       .text(`${index + 1}. ${decision}`, { indent: 20 })
                       .moveDown(0.5);
                });
            }

            // Action Items
            if (meeting.minutes.actionItems && meeting.minutes.actionItems.length > 0) {
                doc.moveDown()
                   .fontSize(12)
                   .text('Action Items:')
                   .moveDown(0.5);

                // Create table for action items
                const tableTop = doc.y;
                const tableLeft = 50;
                const colWidths = [250, 100, 80, 80];
                const rowHeight = 30;

                // Table headers
                doc.fontSize(10)
                   .fillColor('#000000')
                   .text('Task', tableLeft, tableTop)
                   .text('Assignee', tableLeft + colWidths[0], tableTop)
                   .text('Deadline', tableLeft + colWidths[0] + colWidths[1], tableTop)
                   .text('Status', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop);

                // Draw table lines
                doc.moveTo(tableLeft, tableTop + 20)
                   .lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), tableTop + 20)
                   .stroke();

                // Table rows
                meeting.minutes.actionItems.forEach((item, rowIndex) => {
                    const y = tableTop + 20 + (rowIndex * rowHeight);
                    
                    doc.fontSize(9)
                       .text(item.task.substring(0, 50) + (item.task.length > 50 ? '...' : ''), tableLeft, y, { width: colWidths[0] - 10 })
                       .text(item.assignee?.name || 'Unassigned', tableLeft + colWidths[0], y, { width: colWidths[1] - 10 })
                       .text(formatDate(item.deadline) || 'N/A', tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2] - 10 })
                       .text(item.status.charAt(0).toUpperCase() + item.status.slice(1), tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] - 10 });

                    // Draw row separator
                    doc.moveTo(tableLeft, y + 20)
                       .lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), y + 20)
                       .strokeColor('#cccccc')
                       .stroke();
                });
            }

            // Next Meeting
            if (meeting.minutes.nextMeeting) {
                doc.addPage()
                   .fontSize(14)
                   .text('NEXT MEETING', { underline: true })
                   .moveDown(0.5);

                const next = meeting.minutes.nextMeeting;
                doc.fontSize(12)
                   .text(`Date: ${formatDate(next.date) || 'To be determined'}`)
                   .text(`Time: ${next.time || 'To be determined'}`)
                   .text(`Location: ${next.location || 'To be determined'}`)
                   .moveDown();

                if (next.agenda) {
                    doc.text('Proposed Agenda:')
                       .fontSize(11)
                       .text(next.agenda, { indent: 20 });
                }
            }
        }

        // Footer with signatures
        doc.addPage()
           .fontSize(12)
           .text('APPROVALS', { underline: true })
           .moveDown(2);

        // Prepared by
        doc.text('Prepared by:')
           .moveDown(3);
        doc.text('___________________________')
           .text(meeting.minutesTaker?.name || 'Secretary')
           .text(meeting.minutesTaker?.role || 'SIT Student Council')
           .moveDown();

        // Approved by
        doc.text('Approved by:')
           .moveDown(3);
        doc.text('___________________________')
           .text(meeting.chairperson?.name || 'Chairperson')
           .text(meeting.chairperson?.role || 'SIT Student Council');

        // Footer information
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        
        doc.fontSize(8)
           .text(`Document ID: SIT-MIN-${meeting._id}`, 50, pageHeight - 50)
           .text(`Generated: ${formatDate(new Date())}`, pageWidth - 150, pageHeight - 50, { align: 'right' })
           .text(`Page ${doc.page.number}`, pageWidth / 2, pageHeight - 50, { align: 'center' });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate PDF',
            error: error.message
        });
    }
});

// Generate performance report PDF
router.get('/performance/:userId', protect, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Check permission
        if (req.user.id !== userId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Create PDF
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            font: 'Times-Roman'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="SIT-Performance-${user.studentId || user.name}.pdf"`);

        doc.pipe(res);

        // Header
        doc.fontSize(24)
           .text('SIT STUDENT COUNCIL', { align: 'center' })
           .fontSize(18)
           .text('PERFORMANCE REPORT', { align: 'center' })
           .moveDown();

        // User Information
        doc.fontSize(14)
           .text('MEMBER INFORMATION', { underline: true })
           .moveDown(0.5);

        doc.fontSize(12)
           .text(`Name: ${user.name}`)
           .text(`Role: ${user.role}`)
           .text(`Student ID: ${user.studentId || 'N/A'}`)
           .text(`Department: ${user.department || 'N/A'}`)
           .text(`Join Date: ${formatDate(user.joinDate)}`)
           .moveDown();

        // Performance Metrics
        doc.fontSize(14)
           .text('PERFORMANCE METRICS', { underline: true })
           .moveDown(0.5);

        const performance = user.performance || {};
        
        // Create performance table
        const metrics = [
            ['Meetings Attended', performance.meetingsAttended || 0],
            ['Tasks Completed', performance.tasksCompleted || 0],
            ['Performance Rating', `${(performance.rating || 0).toFixed(1)}/5`],
            ['Current Streak', performance.streak || 0],
            ['Achievement Points', performance.points || 0]
        ];

        const tableTop = doc.y;
        const colWidth = 250;
        
        metrics.forEach(([label, value], index) => {
            const y = tableTop + (index * 30);
            doc.fontSize(12)
               .text(label, 50, y)
               .text(value.toString(), 50 + colWidth, y);
        });

        doc.moveDown(2);

        // Achievements
        if (performance.achievements && performance.achievements.length > 0) {
            doc.fontSize(14)
               .text('ACHIEVEMENTS', { underline: true })
               .moveDown(0.5);

            performance.achievements.forEach((achievement, index) => {
                doc.fontSize(12)
                   .text(`${index + 1}. ${achievement}`, { indent: 20 })
                   .moveDown(0.5);
            });
        }

        // Statistics Chart (placeholder text)
        doc.addPage()
           .fontSize(14)
           .text('PERFORMANCE TREND', { underline: true })
           .moveDown();

        doc.fontSize(12)
           .text('Monthly Performance Overview:')
           .moveDown(0.5);

        // Add some sample data visualization
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const scores = [3.5, 4.0, 4.2, 4.5, 4.8, 4.9];
        
        months.forEach((month, index) => {
            const barWidth = scores[index] * 40;
            doc.text(`${month}:`, 50)
               .rect(100, doc.y - 15, barWidth, 20)
               .fill('#2563eb')
               .moveDown();
        });

        // Footer
        const pageHeight = doc.page.height;
        doc.fontSize(10)
           .text(`Report Generated: ${formatDate(new Date())}`, 50, pageHeight - 50)
           .text('SIT Student Council - Performance Management System', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Performance PDF Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate performance report',
            error: error.message
        });
    }
});

// Generate monthly report PDF
router.get('/monthly-report/:year/:month', protect, async (req, res) => {
    try {
        const { year, month } = req.params;
        
        if (req.user.role !== 'Admin' && req.user.role !== 'Secretary') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to generate monthly reports'
            });
        }

        // Find meetings for the month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        
        const meetings = await Meeting.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate('chairperson', 'name')
          .populate('createdBy', 'name')
          .sort('date');

        // Get all users for statistics
        const users = await User.find({ role: { $ne: 'Guest' } });

        // Create PDF
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            font: 'Times-Roman'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="SIT-Monthly-Report-${year}-${month}.pdf"`);

        doc.pipe(res);

        // Header
        doc.fontSize(24)
           .text('SIT STUDENT COUNCIL', { align: 'center' })
           .fontSize(18)
           .text('MONTHLY ACTIVITY REPORT', { align: 'center' })
           .fontSize(14)
           .text(`${getMonthName(month)} ${year}`, { align: 'center' })
           .moveDown();

        // Executive Summary
        doc.fontSize(14)
           .text('EXECUTIVE SUMMARY', { underline: true })
           .moveDown(0.5);

        doc.fontSize(12)
           .text(`Total Meetings: ${meetings.length}`)
           .text(`Total Council Members: ${users.length}`)
           .text(`Report Period: ${formatDate(startDate)} to ${formatDate(endDate)}`)
           .text(`Generated By: ${req.user.name} (${req.user.role})`)
           .moveDown();

        // Meetings Summary
        if (meetings.length > 0) {
            doc.fontSize(14)
               .text('MEETINGS SUMMARY', { underline: true })
               .moveDown(0.5);

            meetings.forEach((meeting, index) => {
                doc.fontSize(12)
                   .text(`${index + 1}. ${meeting.title}`, { indent: 20 })
                   .fontSize(10)
                   .text(`Date: ${formatDate(meeting.date)} | Type: ${meeting.type} | Status: ${meeting.status}`, { indent: 40 })
                   .moveDown(0.5);
            });
        }

        // Attendance Statistics
        doc.addPage()
           .fontSize(14)
           .text('ATTENDANCE STATISTICS', { underline: true })
           .moveDown(0.5);

        // Calculate attendance for each user
        const attendanceStats = users.map(user => {
            const userMeetings = meetings.filter(meeting => 
                meeting.attendees.some(att => att.user && att.user.toString() === user._id.toString())
            );
            
            return {
                name: user.name,
                role: user.role,
                totalMeetings: meetings.length,
                attended: userMeetings.length,
                attendanceRate: meetings.length > 0 ? (userMeetings.length / meetings.length * 100).toFixed(1) : '0.0'
            };
        });

        // Create attendance table
        const tableTop = doc.y;
        const colWidths = [150, 100, 80, 80, 80];
        
        // Table headers
        doc.fontSize(10)
           .text('Member', 50, tableTop)
           .text('Role', 50 + colWidths[0], tableTop)
           .text('Total', 50 + colWidths[0] + colWidths[1], tableTop)
           .text('Attended', 50 + colWidths[0] + colWidths[1] + colWidths[2], tableTop)
           .text('Rate %', 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop);

        // Draw header line
        doc.moveTo(50, tableTop + 15)
           .lineTo(50 + colWidths.reduce((a, b) => a + b, 0), tableTop + 15)
           .stroke();

        // Table rows
        attendanceStats.forEach((stat, index) => {
            const y = tableTop + 20 + (index * 25);
            
            doc.fontSize(9)
               .text(stat.name, 50, y, { width: colWidths[0] - 5 })
               .text(stat.role, 50 + colWidths[0], y, { width: colWidths[1] - 5 })
               .text(stat.totalMeetings.toString(), 50 + colWidths[0] + colWidths[1], y, { width: colWidths[2] - 5 })
               .text(stat.attended.toString(), 50 + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] - 5 })
               .text(stat.attendanceRate, 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, { width: colWidths[4] - 5 });
        });

        // Action Items Summary
        doc.addPage()
           .fontSize(14)
           .text('ACTION ITEMS SUMMARY', { underline: true })
           .moveDown(0.5);

        // Collect all action items from meetings
        const allActionItems = [];
        meetings.forEach(meeting => {
            if (meeting.minutes && meeting.minutes.actionItems) {
                meeting.minutes.actionItems.forEach(item => {
                    allActionItems.push({
                        task: item.task,
                        meeting: meeting.title,
                        assignee: item.assignee?.name || 'Unassigned',
                        deadline: item.deadline,
                        status: item.status
                    });
                });
            }
        });

        if (allActionItems.length > 0) {
            // Group by status
            const pending = allActionItems.filter(item => item.status === 'pending');
            const inProgress = allActionItems.filter(item => item.status === 'in-progress');
            const completed = allActionItems.filter(item => item.status === 'completed');
            const overdue = allActionItems.filter(item => 
                item.deadline && new Date(item.deadline) < new Date() && item.status !== 'completed'
            );

            doc.fontSize(12)
               .text(`Total Action Items: ${allActionItems.length}`)
               .text(`Pending: ${pending.length} | In Progress: ${inProgress.length} | Completed: ${completed.length}`)
               .text(`Overdue: ${overdue.length}`)
               .moveDown();

            // Show overdue items
            if (overdue.length > 0) {
                doc.fontSize(12)
                   .text('OVERDUE ACTION ITEMS:', { underline: true })
                   .moveDown(0.5);

                overdue.forEach((item, index) => {
                    doc.fontSize(10)
                       .text(`${index + 1}. ${item.task}`, { indent: 20 })
                       .text(`Assignee: ${item.assignee} | Meeting: ${item.meeting} | Due: ${formatDate(item.deadline)}`, { indent: 40 })
                       .moveDown(0.5);
                });
            }
        }

        // Recommendations and Notes
        doc.addPage()
           .fontSize(14)
           .text('RECOMMENDATIONS & NOTES', { underline: true })
           .moveDown();

        doc.fontSize(12)
           .text('Key Achievements:')
           .moveDown(0.5);

        const achievements = [
            `Successfully conducted ${meetings.length} meetings`,
            `${completed.length} action items completed`,
            `${users.length} active council members`
        ];

        achievements.forEach((achievement, index) => {
            doc.text(`• ${achievement}`, { indent: 20 })
               .moveDown(0.5);
        });

        doc.moveDown()
           .text('Areas for Improvement:')
           .moveDown(0.5);

        const improvements = [
            overdue.length > 0 ? `Address ${overdue.length} overdue action items` : 'All action items are on track',
            meetings.length < 4 ? 'Consider increasing meeting frequency' : 'Meeting frequency is adequate',
            'Continue monitoring member participation'
        ];

        improvements.forEach((improvement, index) => {
            doc.text(`• ${improvement}`, { indent: 20 })
               .moveDown(0.5);
        });

        // Footer
        const pageHeight = doc.page.height;
        doc.fontSize(10)
           .text(`Report Generated: ${formatDate(new Date())}`, 50, pageHeight - 50)
           .text(`Confidential - SIT Student Council Internal Use Only`, { align: 'center' })
           .text(`Page ${doc.page.number}`, { align: 'right' });

        doc.end();

    } catch (error) {
        console.error('Monthly Report PDF Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate monthly report',
            error: error.message
        });
    }
});

// Helper functions
function formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function getMonthName(month) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || 'Unknown';
}

module.exports = router;const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { protect } = require('../middleware/auth');
const Meeting = require('../models/Meeting');
const User = require('../models/User');

// Generate PDF for meeting minutes
router.get('/generate/:meetingId', protect, async (req, res) => {
    try {
        const meetingId = req.params.meetingId;
        
        // Find meeting
        const meeting = await Meeting.findById(meetingId)
            .populate('chairperson', 'name role')
            .populate('minutesTaker', 'name role')
            .populate('attendees.user', 'name role')
            .populate('minutes.actionItems.assignee', 'name');
        
        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found'
            });
        }

        // Check permission
        if (meeting.createdBy.toString() !== req.user.id && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this meeting'
            });
        }

        // Create PDF document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            font: 'Times-Roman'
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="SIT-Meeting-${meetingId}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Add SBC Logo (placeholder)
        doc.image('public/assets/logo.png', 50, 45, { width: 100 })
           .fillColor('#000000');

        // Header
        doc.fontSize(24)
           .text('SIT STUDENT COUNCIL', 200, 50, { align: 'center' })
           .fontSize(16)
           .text('OFFICIAL MEETING MINUTES', 200, 80, { align: 'center' })
           .moveDown();

        // Meeting Details Section
        doc.fontSize(14)
           .text('MEETING DETAILS', { underline: true })
           .moveDown(0.5);

        doc.fontSize(12)
           .text(`Title: ${meeting.title}`, { continued: true })
           .text(`Date: ${formatDate(meeting.date)}`, { align: 'right' })
           .moveDown(0.5);

        doc.text(`Type: ${meeting.type.charAt(0).toUpperCase() + meeting.type.slice(1)}`, { continued: true })
           .text(`Time: ${meeting.startTime} - ${meeting.endTime}`, { align: 'right' })
           .moveDown(0.5);

        doc.text(`Location: ${meeting.location || 'Not specified'}`, { continued: true })
           .text(`Status: ${meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}`, { align: 'right' })
           .moveDown(0.5);

        doc.text(`Chairperson: ${meeting.chairperson?.name || 'Not specified'}`, { continued: true })
           .text(`Minutes Taker: ${meeting.minutesTaker?.name || 'Not specified'}`, { align: 'right' })
           .moveDown();

        // Objectives
        if (meeting.objective) {
            doc.fontSize(14)
               .text('MEETING OBJECTIVES', { underline: true })
               .moveDown(0.5);

            doc.fontSize(12)
               .text(meeting.objective)
               .moveDown();
        }

        // Attendees Section
        doc.addPage()
           .fontSize(14)
           .text('ATTENDEES', { underline: true })
           .moveDown(0.5);

        const attendees = meeting.attendees || [];
        attendees.forEach((attendee, index) => {
            const status = attendee.status || 'pending';
            const statusText = status.charAt(0).toUpperCase() + status.slice(1);
            
            doc.fontSize(12)
               .text(`${index + 1}. ${attendee.user?.name || 'Unknown'} - ${attendee.user?.role || 'Member'}`, { continued: true })
               .text(`(${statusText})`, { align: 'right' })
               .moveDown(0.5);
        });

        // Agenda Items
        if (meeting.agenda && meeting.agenda.length > 0) {
            doc.addPage()
               .fontSize(14)
               .text('AGENDA ITEMS', { underline: true })
               .moveDown(0.5);

            meeting.agenda.forEach((item, index) => {
                doc.fontSize(12)
                   .text(`${index + 1}. ${item.title}`, { indent: 20 })
                   .fontSize(10)
                   .text(`Presenter: ${item.presenter || 'Not specified'} | Duration: ${item.duration || 15} mins | Status: ${item.status || 'pending'}`)
                   .moveDown(0.5);

                if (item.description) {
                    doc.fontSize(10)
                       .text(`Description: ${item.description}`, { indent: 40 })
                       .moveDown(0.5);
                }
            });
        }

        // Minutes Section
        if (meeting.minutes) {
            doc.addPage()
               .fontSize(14)
               .text('MEETING MINUTES', { underline: true })
               .moveDown(0.5);

            // Summary
            if (meeting.minutes.summary) {
                doc.fontSize(12)
                   .text('Summary:')
                   .fontSize(11)
                   .text(meeting.minutes.summary, { indent: 20 })
                   .moveDown();
            }

            // Decisions
            if (meeting.minutes.decisions && meeting.minutes.decisions.length > 0) {
                doc.fontSize(12)
                   .text('Decisions Made:')
                   .moveDown(0.5);

                meeting.minutes.decisions.forEach((decision, index) => {
                    doc.fontSize(11)
                       .text(`${index + 1}. ${decision}`, { indent: 20 })
                       .moveDown(0.5);
                });
            }

            // Action Items
            if (meeting.minutes.actionItems && meeting.minutes.actionItems.length > 0) {
                doc.moveDown()
                   .fontSize(12)
                   .text('Action Items:')
                   .moveDown(0.5);

                // Create table for action items
                const tableTop = doc.y;
                const tableLeft = 50;
                const colWidths = [250, 100, 80, 80];
                const rowHeight = 30;

                // Table headers
                doc.fontSize(10)
                   .fillColor('#000000')
                   .text('Task', tableLeft, tableTop)
                   .text('Assignee', tableLeft + colWidths[0], tableTop)
                   .text('Deadline', tableLeft + colWidths[0] + colWidths[1], tableTop)
                   .text('Status', tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop);

                // Draw table lines
                doc.moveTo(tableLeft, tableTop + 20)
                   .lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), tableTop + 20)
                   .stroke();

                // Table rows
                meeting.minutes.actionItems.forEach((item, rowIndex) => {
                    const y = tableTop + 20 + (rowIndex * rowHeight);
                    
                    doc.fontSize(9)
                       .text(item.task.substring(0, 50) + (item.task.length > 50 ? '...' : ''), tableLeft, y, { width: colWidths[0] - 10 })
                       .text(item.assignee?.name || 'Unassigned', tableLeft + colWidths[0], y, { width: colWidths[1] - 10 })
                       .text(formatDate(item.deadline) || 'N/A', tableLeft + colWidths[0] + colWidths[1], y, { width: colWidths[2] - 10 })
                       .text(item.status.charAt(0).toUpperCase() + item.status.slice(1), tableLeft + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] - 10 });

                    // Draw row separator
                    doc.moveTo(tableLeft, y + 20)
                       .lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), y + 20)
                       .strokeColor('#cccccc')
                       .stroke();
                });
            }

            // Next Meeting
            if (meeting.minutes.nextMeeting) {
                doc.addPage()
                   .fontSize(14)
                   .text('NEXT MEETING', { underline: true })
                   .moveDown(0.5);

                const next = meeting.minutes.nextMeeting;
                doc.fontSize(12)
                   .text(`Date: ${formatDate(next.date) || 'To be determined'}`)
                   .text(`Time: ${next.time || 'To be determined'}`)
                   .text(`Location: ${next.location || 'To be determined'}`)
                   .moveDown();

                if (next.agenda) {
                    doc.text('Proposed Agenda:')
                       .fontSize(11)
                       .text(next.agenda, { indent: 20 });
                }
            }
        }

        // Footer with signatures
        doc.addPage()
           .fontSize(12)
           .text('APPROVALS', { underline: true })
           .moveDown(2);

        // Prepared by
        doc.text('Prepared by:')
           .moveDown(3);
        doc.text('___________________________')
           .text(meeting.minutesTaker?.name || 'Secretary')
           .text(meeting.minutesTaker?.role || 'SIT Student Council')
           .moveDown();

        // Approved by
        doc.text('Approved by:')
           .moveDown(3);
        doc.text('___________________________')
           .text(meeting.chairperson?.name || 'Chairperson')
           .text(meeting.chairperson?.role || 'SIT Student Council');

        // Footer information
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        
        doc.fontSize(8)
           .text(`Document ID: SIT-MIN-${meeting._id}`, 50, pageHeight - 50)
           .text(`Generated: ${formatDate(new Date())}`, pageWidth - 150, pageHeight - 50, { align: 'right' })
           .text(`Page ${doc.page.number}`, pageWidth / 2, pageHeight - 50, { align: 'center' });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate PDF',
            error: error.message
        });
    }
});

// Generate performance report PDF
router.get('/performance/:userId', protect, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Check permission
        if (req.user.id !== userId && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Create PDF
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            font: 'Times-Roman'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="SIT-Performance-${user.studentId || user.name}.pdf"`);

        doc.pipe(res);

        // Header
        doc.fontSize(24)
           .text('SIT STUDENT COUNCIL', { align: 'center' })
           .fontSize(18)
           .text('PERFORMANCE REPORT', { align: 'center' })
           .moveDown();

        // User Information
        doc.fontSize(14)
           .text('MEMBER INFORMATION', { underline: true })
           .moveDown(0.5);

        doc.fontSize(12)
           .text(`Name: ${user.name}`)
           .text(`Role: ${user.role}`)
           .text(`Student ID: ${user.studentId || 'N/A'}`)
           .text(`Department: ${user.department || 'N/A'}`)
           .text(`Join Date: ${formatDate(user.joinDate)}`)
           .moveDown();

        // Performance Metrics
        doc.fontSize(14)
           .text('PERFORMANCE METRICS', { underline: true })
           .moveDown(0.5);

        const performance = user.performance || {};
        
        // Create performance table
        const metrics = [
            ['Meetings Attended', performance.meetingsAttended || 0],
            ['Tasks Completed', performance.tasksCompleted || 0],
            ['Performance Rating', `${(performance.rating || 0).toFixed(1)}/5`],
            ['Current Streak', performance.streak || 0],
            ['Achievement Points', performance.points || 0]
        ];

        const tableTop = doc.y;
        const colWidth = 250;
        
        metrics.forEach(([label, value], index) => {
            const y = tableTop + (index * 30);
            doc.fontSize(12)
               .text(label, 50, y)
               .text(value.toString(), 50 + colWidth, y);
        });

        doc.moveDown(2);

        // Achievements
        if (performance.achievements && performance.achievements.length > 0) {
            doc.fontSize(14)
               .text('ACHIEVEMENTS', { underline: true })
               .moveDown(0.5);

            performance.achievements.forEach((achievement, index) => {
                doc.fontSize(12)
                   .text(`${index + 1}. ${achievement}`, { indent: 20 })
                   .moveDown(0.5);
            });
        }

        // Statistics Chart (placeholder text)
        doc.addPage()
           .fontSize(14)
           .text('PERFORMANCE TREND', { underline: true })
           .moveDown();

        doc.fontSize(12)
           .text('Monthly Performance Overview:')
           .moveDown(0.5);

        // Add some sample data visualization
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const scores = [3.5, 4.0, 4.2, 4.5, 4.8, 4.9];
        
        months.forEach((month, index) => {
            const barWidth = scores[index] * 40;
            doc.text(`${month}:`, 50)
               .rect(100, doc.y - 15, barWidth, 20)
               .fill('#2563eb')
               .moveDown();
        });

        // Footer
        const pageHeight = doc.page.height;
        doc.fontSize(10)
           .text(`Report Generated: ${formatDate(new Date())}`, 50, pageHeight - 50)
           .text('SIT Student Council - Performance Management System', { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('Performance PDF Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate performance report',
            error: error.message
        });
    }
});

// Generate monthly report PDF
router.get('/monthly-report/:year/:month', protect, async (req, res) => {
    try {
        const { year, month } = req.params;
        
        if (req.user.role !== 'Admin' && req.user.role !== 'Secretary') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to generate monthly reports'
            });
        }

        // Find meetings for the month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        
        const meetings = await Meeting.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).populate('chairperson', 'name')
          .populate('createdBy', 'name')
          .sort('date');

        // Get all users for statistics
        const users = await User.find({ role: { $ne: 'Guest' } });

        // Create PDF
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            font: 'Times-Roman'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="SIT-Monthly-Report-${year}-${month}.pdf"`);

        doc.pipe(res);

        // Header
        doc.fontSize(24)
           .text('SIT STUDENT COUNCIL', { align: 'center' })
           .fontSize(18)
           .text('MONTHLY ACTIVITY REPORT', { align: 'center' })
           .fontSize(14)
           .text(`${getMonthName(month)} ${year}`, { align: 'center' })
           .moveDown();

        // Executive Summary
        doc.fontSize(14)
           .text('EXECUTIVE SUMMARY', { underline: true })
           .moveDown(0.5);

        doc.fontSize(12)
           .text(`Total Meetings: ${meetings.length}`)
           .text(`Total Council Members: ${users.length}`)
           .text(`Report Period: ${formatDate(startDate)} to ${formatDate(endDate)}`)
           .text(`Generated By: ${req.user.name} (${req.user.role})`)
           .moveDown();

        // Meetings Summary
        if (meetings.length > 0) {
            doc.fontSize(14)
               .text('MEETINGS SUMMARY', { underline: true })
               .moveDown(0.5);

            meetings.forEach((meeting, index) => {
                doc.fontSize(12)
                   .text(`${index + 1}. ${meeting.title}`, { indent: 20 })
                   .fontSize(10)
                   .text(`Date: ${formatDate(meeting.date)} | Type: ${meeting.type} | Status: ${meeting.status}`, { indent: 40 })
                   .moveDown(0.5);
            });
        }

        // Attendance Statistics
        doc.addPage()
           .fontSize(14)
           .text('ATTENDANCE STATISTICS', { underline: true })
           .moveDown(0.5);

        // Calculate attendance for each user
        const attendanceStats = users.map(user => {
            const userMeetings = meetings.filter(meeting => 
                meeting.attendees.some(att => att.user && att.user.toString() === user._id.toString())
            );
            
            return {
                name: user.name,
                role: user.role,
                totalMeetings: meetings.length,
                attended: userMeetings.length,
                attendanceRate: meetings.length > 0 ? (userMeetings.length / meetings.length * 100).toFixed(1) : '0.0'
            };
        });

        // Create attendance table
        const tableTop = doc.y;
        const colWidths = [150, 100, 80, 80, 80];
        
        // Table headers
        doc.fontSize(10)
           .text('Member', 50, tableTop)
           .text('Role', 50 + colWidths[0], tableTop)
           .text('Total', 50 + colWidths[0] + colWidths[1], tableTop)
           .text('Attended', 50 + colWidths[0] + colWidths[1] + colWidths[2], tableTop)
           .text('Rate %', 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop);

        // Draw header line
        doc.moveTo(50, tableTop + 15)
           .lineTo(50 + colWidths.reduce((a, b) => a + b, 0), tableTop + 15)
           .stroke();

        // Table rows
        attendanceStats.forEach((stat, index) => {
            const y = tableTop + 20 + (index * 25);
            
            doc.fontSize(9)
               .text(stat.name, 50, y, { width: colWidths[0] - 5 })
               .text(stat.role, 50 + colWidths[0], y, { width: colWidths[1] - 5 })
               .text(stat.totalMeetings.toString(), 50 + colWidths[0] + colWidths[1], y, { width: colWidths[2] - 5 })
               .text(stat.attended.toString(), 50 + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3] - 5 })
               .text(stat.attendanceRate, 50 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, { width: colWidths[4] - 5 });
        });

        // Action Items Summary
        doc.addPage()
           .fontSize(14)
           .text('ACTION ITEMS SUMMARY', { underline: true })
           .moveDown(0.5);

        // Collect all action items from meetings
        const allActionItems = [];
        meetings.forEach(meeting => {
            if (meeting.minutes && meeting.minutes.actionItems) {
                meeting.minutes.actionItems.forEach(item => {
                    allActionItems.push({
                        task: item.task,
                        meeting: meeting.title,
                        assignee: item.assignee?.name || 'Unassigned',
                        deadline: item.deadline,
                        status: item.status
                    });
                });
            }
        });

        if (allActionItems.length > 0) {
            // Group by status
            const pending = allActionItems.filter(item => item.status === 'pending');
            const inProgress = allActionItems.filter(item => item.status === 'in-progress');
            const completed = allActionItems.filter(item => item.status === 'completed');
            const overdue = allActionItems.filter(item => 
                item.deadline && new Date(item.deadline) < new Date() && item.status !== 'completed'
            );

            doc.fontSize(12)
               .text(`Total Action Items: ${allActionItems.length}`)
               .text(`Pending: ${pending.length} | In Progress: ${inProgress.length} | Completed: ${completed.length}`)
               .text(`Overdue: ${overdue.length}`)
               .moveDown();

            // Show overdue items
            if (overdue.length > 0) {
                doc.fontSize(12)
                   .text('OVERDUE ACTION ITEMS:', { underline: true })
                   .moveDown(0.5);

                overdue.forEach((item, index) => {
                    doc.fontSize(10)
                       .text(`${index + 1}. ${item.task}`, { indent: 20 })
                       .text(`Assignee: ${item.assignee} | Meeting: ${item.meeting} | Due: ${formatDate(item.deadline)}`, { indent: 40 })
                       .moveDown(0.5);
                });
            }
        }

        // Recommendations and Notes
        doc.addPage()
           .fontSize(14)
           .text('RECOMMENDATIONS & NOTES', { underline: true })
           .moveDown();

        doc.fontSize(12)
           .text('Key Achievements:')
           .moveDown(0.5);

        const achievements = [
            `Successfully conducted ${meetings.length} meetings`,
            `${completed.length} action items completed`,
            `${users.length} active council members`
        ];

        achievements.forEach((achievement, index) => {
            doc.text(`• ${achievement}`, { indent: 20 })
               .moveDown(0.5);
        });

        doc.moveDown()
           .text('Areas for Improvement:')
           .moveDown(0.5);

        const improvements = [
            overdue.length > 0 ? `Address ${overdue.length} overdue action items` : 'All action items are on track',
            meetings.length < 4 ? 'Consider increasing meeting frequency' : 'Meeting frequency is adequate',
            'Continue monitoring member participation'
        ];

        improvements.forEach((improvement, index) => {
            doc.text(`• ${improvement}`, { indent: 20 })
               .moveDown(0.5);
        });

        // Footer
        const pageHeight = doc.page.height;
        doc.fontSize(10)
           .text(`Report Generated: ${formatDate(new Date())}`, 50, pageHeight - 50)
           .text(`Confidential - SIT Student Council Internal Use Only`, { align: 'center' })
           .text(`Page ${doc.page.number}`, { align: 'right' });

        doc.end();

    } catch (error) {
        console.error('Monthly Report PDF Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate monthly report',
            error: error.message
        });
    }
});

// Helper functions
function formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function getMonthName(month) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || 'Unknown';
}

module.exports = router;
