const mongoose = require('mongoose');

const performanceRecordSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    period: {
        type: String,
        required: true,
        enum: ['daily', 'weekly', 'monthly', 'yearly'],
        default: 'monthly'
    },
    periodDate: {
        type: Date,
        required: true,
        index: true
    },
    metrics: {
        // Attendance Metrics
        meetingsTotal: {
            type: Number,
            default: 0
        },
        meetingsAttended: {
            type: Number,
            default: 0
        },
        meetingsAbsent: {
            type: Number,
            default: 0
        },
        meetingsLate: {
            type: Number,
            default: 0
        },
        attendanceRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        
        // Task Metrics
        tasksAssigned: {
            type: Number,
            default: 0
        },
        tasksCompleted: {
            type: Number,
            default: 0
        },
        tasksPending: {
            type: Number,
            default: 0
        },
        tasksOverdue: {
            type: Number,
            default: 0
        },
        taskCompletionRate: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        
        // Contribution Metrics
        agendaItemsCreated: {
            type: Number,
            default: 0
        },
        decisionsContributed: {
            type: Number,
            default: 0
        },
        questionsAsked: {
            type: Number,
            default: 0
        },
        suggestionsProvided: {
            type: Number,
            default: 0
        },
        
        // Quality Metrics
        averageTaskRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        peerRating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        leadershipScore: {
            type: Number
