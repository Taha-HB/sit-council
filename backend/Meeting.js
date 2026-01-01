const mongoose = require('mongoose');

const attendeeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'present', 'absent', 'late'],
    default: 'pending'
  },
  arrivalTime: String,
  notes: String
});

const agendaItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  presenter: String,
  duration: {
    type: Number,
    default: 15
  },
  description: String,
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'deferred'],
    default: 'pending'
  },
  order: Number
});

const actionItemSchema = new mongoose.Schema({
  task: {
    type: String,
    required: true
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deadline: Date,
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'overdue'],
    default: 'pending'
  },
  completedAt: Date
});

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  askedBy: String,
  answer: String,
  status: {
    type: String,
    enum: ['pending', 'answered'],
    default: 'pending'
  }
});

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Meeting title is required']
  },
  type: {
    type: String,
    enum: ['regular', 'random', 'special', 'committee'],
    default: 'regular'
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  location: String,
  chairperson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  minutesTaker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  objective: String,
  attendees: [attendeeSchema],
  agenda: [agendaItemSchema],
  questions: [questionSchema],
  minutes: {
    summary: String,
    decisions: [String],
    actionItems: [actionItemSchema],
    nextMeeting: {
      date: Date,
      time: String,
      location: String,
      agenda: String
    }
  },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attachments: [{
    filename: String,
    url: String,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [String]
}, {
  timestamps: true
});

// Indexes for better query performance
meetingSchema.index({ date: 1 });
meetingSchema.index({ status: 1 });
meetingSchema.index({ createdBy: 1 });
meetingSchema.index({ isArchived: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);
module.exports = Meeting;
