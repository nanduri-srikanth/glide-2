import { Note } from './types';

export const mockNotes: Note[] = [
  {
    id: '1',
    title: 'Team standup - Sprint planning',
    timestamp: '2025-01-25T09:30:00',
    duration: 342, // 5:42
    transcript: `Good morning everyone. Let's go through our sprint planning for this week.

First, Sarah mentioned she'll be focusing on the authentication module. She needs to coordinate with the backend team about the API endpoints.

Mike will be working on the dashboard redesign. He should have mockups ready by Wednesday for review.

I need to schedule a meeting with the stakeholders for Thursday afternoon to discuss the Q2 roadmap. Also, remind myself to send the project update email to the leadership team before end of day Friday.

Action items:
- Schedule stakeholder meeting for Thursday 2pm
- Sarah to sync with backend team
- Mike to deliver mockups by Wednesday
- Send Q2 update email by Friday EOD`,
    actions: {
      calendar: [
        {
          id: 'cal-1',
          title: 'Stakeholder Meeting - Q2 Roadmap',
          date: '2025-01-30',
          time: '14:00',
          location: 'Conference Room A',
          attendees: ['John', 'Sarah', 'Mike', 'Leadership Team'],
          status: 'created',
        },
        {
          id: 'cal-2',
          title: 'Mockup Review with Mike',
          date: '2025-01-29',
          time: '10:00',
          status: 'created',
        },
      ],
      email: [
        {
          id: 'email-1',
          to: 'leadership@company.com',
          subject: 'Q2 Project Update',
          preview: 'Hi team, I wanted to share a quick update on our Q2 progress...',
          status: 'draft',
        },
      ],
      reminders: [
        {
          id: 'rem-1',
          title: 'Send Q2 update email',
          dueDate: '2025-01-31',
          dueTime: '17:00',
          priority: 'high',
          status: 'pending',
        },
        {
          id: 'rem-2',
          title: 'Review Mike\'s mockups',
          dueDate: '2025-01-29',
          priority: 'medium',
          status: 'pending',
        },
      ],
      nextSteps: [
        'Confirm meeting room availability',
        'Prepare Q2 presentation slides',
        'Gather metrics from analytics team',
      ],
    },
    folderId: 'meetings',
    tags: ['work', 'sprint', 'planning'],
  },
  {
    id: '2',
    title: 'Product brainstorm - New features',
    timestamp: '2025-01-24T14:15:00',
    duration: 487, // 8:07
    transcript: `Brainstorming session for new product features.

Key ideas discussed:
1. Voice-to-action feature - let users speak naturally and automatically extract tasks
2. Smart scheduling - AI suggests optimal meeting times
3. Integration with calendar apps - sync across platforms

We should prototype the voice feature first since it aligns with our Q2 goals. Need to research speech-to-text APIs - check out OpenAI Whisper and AssemblyAI.

Follow up with design team next week to create wireframes.`,
    actions: {
      calendar: [
        {
          id: 'cal-3',
          title: 'Design Team Wireframe Session',
          date: '2025-01-28',
          time: '11:00',
          status: 'created',
        },
      ],
      email: [],
      reminders: [
        {
          id: 'rem-3',
          title: 'Research speech-to-text APIs',
          dueDate: '2025-01-27',
          priority: 'high',
          status: 'pending',
        },
      ],
      nextSteps: [
        'Compare Whisper vs AssemblyAI pricing',
        'Create feature specification document',
        'Schedule design review',
      ],
    },
    folderId: 'ideas',
    tags: ['product', 'brainstorm', 'features'],
  },
  {
    id: '3',
    title: 'Client call - Project kickoff',
    timestamp: '2025-01-23T10:00:00',
    duration: 1245, // 20:45
    transcript: `Kickoff call with Acme Corp for the new mobile app project.

Key discussion points:
- Timeline: 3 month development, launch in April
- Budget confirmed at $150k
- Primary contact: Jennifer Smith (jennifer@acme.com)
- Weekly check-ins every Tuesday at 2pm

Technical requirements:
- iOS and Android native apps
- Integration with their existing CRM
- Offline mode required
- Push notifications

Need to send the SOW by end of week and schedule the technical deep-dive for next Monday.`,
    actions: {
      calendar: [
        {
          id: 'cal-4',
          title: 'Weekly Check-in with Acme Corp',
          date: '2025-01-28',
          time: '14:00',
          status: 'created',
        },
        {
          id: 'cal-5',
          title: 'Technical Deep-dive - Acme Project',
          date: '2025-01-27',
          time: '10:00',
          attendees: ['Dev Team', 'Jennifer Smith'],
          status: 'created',
        },
      ],
      email: [
        {
          id: 'email-2',
          to: 'jennifer@acme.com',
          subject: 'Statement of Work - Mobile App Project',
          preview: 'Hi Jennifer, Thank you for the productive kickoff call. Please find attached...',
          status: 'draft',
        },
      ],
      reminders: [
        {
          id: 'rem-4',
          title: 'Finalize and send SOW to Acme',
          dueDate: '2025-01-26',
          dueTime: '17:00',
          priority: 'high',
          status: 'pending',
        },
      ],
      nextSteps: [
        'Draft Statement of Work',
        'Set up project in Jira',
        'Create Slack channel with client',
        'Schedule recurring Tuesday meetings',
      ],
    },
    folderId: 'work',
    tags: ['client', 'acme', 'kickoff'],
  },
  {
    id: '4',
    title: 'Personal goals - January review',
    timestamp: '2025-01-22T20:30:00',
    duration: 256, // 4:16
    transcript: `Quick reflection on January goals.

Fitness:
- Hit the gym 12 times this month, target was 15
- Running total: 25 miles
- Need to be more consistent with morning workouts

Reading:
- Finished 2 books, on track for 24 this year
- Currently reading "Atomic Habits"

Finance:
- Stayed under budget this month
- Reminder to review investment portfolio next week
- Schedule call with financial advisor

Overall doing well, need to focus more on fitness consistency.`,
    actions: {
      calendar: [
        {
          id: 'cal-6',
          title: 'Financial Advisor Call',
          date: '2025-01-29',
          time: '16:00',
          status: 'pending',
        },
      ],
      email: [],
      reminders: [
        {
          id: 'rem-5',
          title: 'Review investment portfolio',
          dueDate: '2025-01-28',
          priority: 'medium',
          status: 'pending',
        },
        {
          id: 'rem-6',
          title: 'Morning gym session',
          dueDate: '2025-01-26',
          dueTime: '07:00',
          priority: 'medium',
          status: 'pending',
        },
      ],
      nextSteps: [
        'Set gym alarm for 6:30am',
        'Prepare questions for financial advisor',
        'Start next book on reading list',
      ],
    },
    folderId: 'personal',
    tags: ['goals', 'fitness', 'finance'],
  },
  {
    id: '5',
    title: 'Quick note - App idea',
    timestamp: '2025-01-21T16:45:00',
    duration: 67, // 1:07
    transcript: `Had a quick idea while walking. What if we built a feature that automatically detects when someone mentions a date or time in their voice note and offers to create a calendar event? Could use NLP to parse natural language dates like "next Tuesday" or "in two weeks".`,
    actions: {
      calendar: [],
      email: [],
      reminders: [
        {
          id: 'rem-7',
          title: 'Research NLP date parsing libraries',
          dueDate: '2025-01-27',
          priority: 'low',
          status: 'pending',
        },
      ],
      nextSteps: [
        'Look into chrono-node library',
        'Add to product backlog',
      ],
    },
    folderId: 'ideas',
    tags: ['idea', 'feature', 'nlp'],
  },
  {
    id: '6',
    title: '1:1 with Sarah - Career development',
    timestamp: '2025-01-20T15:00:00',
    duration: 1856, // 30:56
    transcript: `One-on-one meeting with Sarah about her career development.

She's interested in moving into a tech lead role. We discussed:
- Current skills: Strong in React, Node.js, good code review practices
- Areas to develop: System design, mentoring, stakeholder communication

Action plan:
1. Assign her to lead the next sprint planning
2. Have her shadow me in the stakeholder meeting
3. Recommend some architecture courses
4. Schedule monthly career check-ins

She mentioned wanting to attend ReactConf in May - approved, need to submit expense request.`,
    actions: {
      calendar: [
        {
          id: 'cal-7',
          title: 'Career Check-in with Sarah',
          date: '2025-02-20',
          time: '15:00',
          status: 'created',
        },
      ],
      email: [
        {
          id: 'email-3',
          to: 'sarah@company.com',
          subject: 'Career Development Resources',
          preview: 'Hi Sarah, Following up on our conversation, here are some resources...',
          status: 'draft',
        },
      ],
      reminders: [
        {
          id: 'rem-8',
          title: 'Submit ReactConf expense request for Sarah',
          dueDate: '2025-01-27',
          priority: 'medium',
          status: 'pending',
        },
        {
          id: 'rem-9',
          title: 'Assign Sarah to lead sprint planning',
          dueDate: '2025-01-27',
          priority: 'high',
          status: 'pending',
        },
      ],
      nextSteps: [
        'Find system design courses on Udemy',
        'Add Sarah to stakeholder meeting invite',
        'Update team structure document',
      ],
    },
    folderId: 'meetings',
    tags: ['1:1', 'career', 'sarah'],
  },
];

// Helper function to get notes by folder
export const getNotesByFolder = (folderId: string): Note[] => {
  if (folderId === 'all-icloud' || folderId === 'notes') {
    return mockNotes;
  }
  return mockNotes.filter(note => note.folderId === folderId);
};

// Helper function to get a note by ID
export const getNoteById = (noteId: string): Note | undefined => {
  return mockNotes.find(note => note.id === noteId);
};

// Helper function to format duration
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to format relative time
export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};
