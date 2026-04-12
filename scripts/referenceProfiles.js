/**
 * Reference profiles for validating the scoring engine.
 * Each profile has expected score ranges per school tier.
 * Run after any analyzer change to verify rank ordering and spread.
 *
 * Usage: node scripts/validateReferenceProfiles.js
 */

const PROFILES = {
  // Profile A — Elite applicant
  A: {
    label: 'Elite applicant',
    application: {
      academics: {
        gpa: 3.98,
        courseRigor: 'most_demanding',
        intendedMajor: 'Computer Science',
        tests: { sat: 1570 },
      },
      activities: [
        { name: 'AI Research Lab', role: 'Research Intern', description: 'Published co-authored paper on neural network optimization at university lab. Presented at regional CS conference.', yearsActive: 2, isLeadership: false },
        { name: 'Code for Change', role: 'Founder & President', description: 'Founded nonprofit coding bootcamp for underserved high schoolers. Grew to 200+ students across 3 schools. Recruited and managed 15 volunteer tutors.', yearsActive: 3, isLeadership: true },
        { name: 'Varsity Math Team', role: 'Captain', description: 'Led team to state finals two consecutive years. Organized weekly practice sessions and mentored underclassmen.', yearsActive: 4, isLeadership: true },
        { name: 'Robotics Club', role: 'Lead Engineer', description: 'Designed autonomous navigation system for competition robot. Team placed 2nd at nationals.', yearsActive: 3, isLeadership: true },
        { name: 'Piano', role: 'Performer', description: 'Performed at Carnegie Hall youth showcase. 12 years of classical training.', yearsActive: 4, isLeadership: false },
      ],
      honors: [
        { title: 'USAMO Qualifier', level: 'national', year: '2024' },
        { title: 'National Merit Finalist', level: 'national', year: '2024' },
        { title: 'Intel ISEF Finalist', level: 'international', year: '2024' },
      ],
      essays: {
        personalStatement: 'The first time my neural network failed to converge, I spent seventy-two hours debugging gradient flows instead of sleeping. My roommates thought I was obsessed. They were right. But that failure taught me something no textbook had: the difference between understanding an algorithm and understanding why an algorithm matters. When I founded Code for Change the following summer, I carried that lesson with me. Teaching Python to kids who had never touched a terminal forced me to strip away jargon and confront what computation actually means—not as an abstraction, but as a tool for thinking. The student who used her first program to model water flow in her drought-affected neighborhood changed how I see my own research. I no longer optimize functions in isolation. I ask: who does this serve? At Stanford, I want to explore human-centered AI not because it sounds good, but because I have watched a fifteen-year-old realize that code can describe her world. That moment is worth seventy-two sleepless hours.',
      },
      intendedMajor: 'Computer Science',
    },
    expectedScores: {
      ultraSelective: { min: 6.0, max: 8.5 },   // Stanford, Harvard, MIT
      highlySelective: { min: 6.5, max: 9.0 },    // UCLA, USC, Berkeley
      selective: { min: 7.0, max: 9.5 },          // Michigan, UT Austin
      accessible: { min: 7.5, max: 10.0 },         // UW, WSU
    },
    expectedBands: {
      stanford: 'reach',    // Elite profile temporarily treated as reach
      harvard: 'reach',
      mit: 'reach',
      uw: 'safety',
      wsu: 'safety',
    },
  },

  // Profile B — Strong applicant
  B: {
    label: 'Strong applicant',
    application: {
      academics: {
        gpa: 3.88,
        courseRigor: 'ap_ib',
        intendedMajor: 'Computer Science',
        tests: { sat: 1450 },
      },
      activities: [
        { name: 'Robotics Club', role: 'Team Captain', description: 'Led a 15-member team to design and build autonomous robots for regional competitions.', yearsActive: 3, isLeadership: true },
        { name: 'Code for Community', role: 'Founder', description: 'Started a volunteer group that builds websites for local nonprofits.', yearsActive: 2, isLeadership: true },
        { name: 'Math Tutoring', role: 'Volunteer Tutor', description: 'Tutored underclassmen in algebra and precalculus weekly.', yearsActive: 2, isLeadership: false },
      ],
      honors: [
        { title: 'AP Scholar with Distinction', level: 'national', year: '2024' },
        { title: 'First Place Regional Robotics', level: 'regional', year: '2023' },
      ],
      essays: {
        personalStatement: 'When our robotics prototype failed at regionals, I spent three weeks reverse-engineering the sensor array. That process — breaking something down to understand why it failed — shaped how I approach every problem now. I want to study computer science because I have learned that building things that work requires understanding why things break.',
      },
      intendedMajor: 'Computer Science',
    },
    expectedScores: {
      ultraSelective: { min: 4.5, max: 6.5 },
      highlySelective: { min: 5.0, max: 7.0 },
      selective: { min: 5.5, max: 9.5 },
      accessible: { min: 6.5, max: 10.0 },
    },
    expectedBands: {
      stanford: 'reach',
      harvard: 'reach',
      mit: 'reach',
      uw: 'safety',
      wsu: 'safety',
    },
  },

  // Profile C — Average applicant
  C: {
    label: 'Average applicant',
    application: {
      academics: {
        gpa: 3.5,
        courseRigor: 'honors',
        intendedMajor: 'Business',
      },
      activities: [
        { name: 'Student Government', role: 'Class Representative', description: 'Attended weekly meetings and helped plan school events.', yearsActive: 2, isLeadership: false },
        { name: 'Volunteer at Food Bank', role: 'Volunteer', description: 'Sorted and distributed food on weekends.', yearsActive: 1, isLeadership: false },
      ],
      honors: [
        { title: 'Honor Roll', level: 'school', year: '2024' },
      ],
      essays: {
        personalStatement: 'I have always been interested in business and leadership. In student government, I learned how to work with others and communicate effectively. I want to attend a university where I can grow as a leader and learn from diverse perspectives. I believe education is the key to making a difference in the world.',
      },
      intendedMajor: 'Business',
    },
    expectedScores: {
      ultraSelective: { min: 3.0, max: 5.0 },
      highlySelective: { min: 4.0, max: 6.0 },
      selective: { min: 4.0, max: 6.5 },
      accessible: { min: 4.5, max: 8.0 },
    },
    expectedBands: {
      stanford: 'reach',
      harvard: 'reach',
      mit: 'reach',
      uw: 'reach',
      wsu: 'safety',
    },
  },

  // Profile D — Below average applicant
  D: {
    label: 'Below average applicant',
    application: {
      academics: {
        gpa: 3.0,
        courseRigor: 'standard',
        intendedMajor: 'Communications',
      },
      activities: [
        { name: 'School Newspaper', role: 'Writer', description: 'Wrote articles occasionally.', yearsActive: 1, isLeadership: false },
      ],
      honors: [],
      essays: {
        personalStatement: 'I want to go to college because it is important for my future. I think I would be a good fit because I work hard and care about learning. I am interested in communications because I like talking to people and sharing ideas.',
      },
      intendedMajor: 'Communications',
    },
    expectedScores: {
      ultraSelective: { min: 1.5, max: 4.0 },
      highlySelective: { min: 2.5, max: 4.5 },
      selective: { min: 2.5, max: 5.0 },
      accessible: { min: 2.5, max: 6.0 },
    },
    expectedBands: {
      stanford: 'reach',
      harvard: 'reach',
      mit: 'reach',
      uw: 'reach',
      wsu: 'reach',
    },
  },

  // Profile E — Minimal applicant
  E: {
    label: 'Minimal applicant',
    application: {
      academics: {
        gpa: 2.7,
        courseRigor: 'standard',
        intendedMajor: '',
      },
      activities: [],
      honors: [],
      essays: {
        personalStatement: 'I want to go to college.',
      },
      intendedMajor: '',
    },
    expectedScores: {
      ultraSelective: { min: 2.5, max: 4.0 },
      highlySelective: { min: 1.5, max: 3.5 },
      selective: { min: 1.0, max: 4.0 },
      accessible: { min: 1.0, max: 5.0 },
    },
    expectedBands: {
      stanford: 'reach',
      harvard: 'reach',
      mit: 'reach',
      uw: 'reach',
      wsu: 'reach',
    },
  },
};

// School tier mapping
const SCHOOL_TIERS = {
  'Stanford University': 'ultraSelective',
  'Harvard University': 'ultraSelective',
  'Massachusetts Institute of Technology': 'ultraSelective',
  'Yale University': 'ultraSelective',
  'Princeton University': 'ultraSelective',
  'Columbia University in the City of New York': 'ultraSelective',
  'University of Pennsylvania': 'ultraSelective',
  'Duke University': 'ultraSelective',
  'New York University': 'ultraSelective',
  'University of California, Los Angeles': 'highlySelective',
  'University of Southern California': 'highlySelective',
  'University of California, Berkeley': 'highlySelective',
  'Northwestern University': 'highlySelective',
  'Rice University': 'highlySelective',
  'Georgia Institute of Technology': 'highlySelective',
  'University of Virginia': 'highlySelective',
  'University of Michigan – Ann Arbor': 'selective',
  'The University of Texas at Austin': 'selective',
  'University of Florida': 'selective',
  'University of California, San Diego': 'selective',
  'University of Illinois Urbana-Champaign': 'selective',
  'University of California, Davis': 'selective',
  'Purdue University': 'selective',
  'University of Washington': 'accessible',
  'Washington State University': 'accessible',
};

module.exports = { PROFILES, SCHOOL_TIERS };
