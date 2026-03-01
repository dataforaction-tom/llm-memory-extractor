import type { ExtractionSchema, StoredSchema, Category, PIIRule } from '@/types';
import { getSchema, saveSchema as dbSaveSchema } from '@/storage/db';

// ---------------------------------------------------------------------------
// Default Categories (22)
// ---------------------------------------------------------------------------

const defaultCategories: Category[] = [
  {
    id: 'identity',
    name: 'Identity & Self',
    description:
      'How the user describes themselves, their personality, values, and self-perception.',
    extractionHints: [
      'Self-descriptions and personality traits',
      'Personal values and beliefs',
      'Cultural background and identity',
      'Pronouns and how they refer to themselves',
      'Life philosophy or worldview',
    ],
    examples: [
      'Describes themselves as an introvert who recharges by reading',
      'Values honesty and directness in communication',
      'Identifies as a lifelong learner',
    ],
    enabled: true,
  },
  {
    id: 'work',
    name: 'Work & Career',
    description:
      'Professional life, job roles, workplace preferences, and career aspirations.',
    extractionHints: [
      'Job titles and roles',
      'Companies and organizations',
      'Work preferences (remote, async, etc.)',
      'Professional skills and tools',
      'Career goals and aspirations',
    ],
    examples: [
      'Works as a senior engineer at Acme Corp',
      'Prefers async communication over meetings',
      'Currently learning Rust for systems programming',
    ],
    enabled: true,
  },
  {
    id: 'housing',
    name: 'Housing & Living',
    description:
      'Living situation, home environment, and housing preferences.',
    extractionHints: [
      'Type of home (apartment, house, etc.)',
      'Living arrangement (alone, with partner, roommates)',
      'Home office or workspace setup',
      'Neighbourhood or area type (urban, suburban, rural)',
      'Housing goals or plans',
    ],
    examples: [
      'Lives in a two-bedroom apartment with their partner',
      'Has a dedicated home office with a standing desk',
      'Planning to move to a house with a garden next year',
    ],
    enabled: true,
  },
  {
    id: 'health',
    name: 'Health & Wellness',
    description:
      'Health conditions, wellness practices, and medical preferences.',
    extractionHints: [
      'Dietary requirements and restrictions',
      'Health conditions or concerns (general, not specific diagnoses)',
      'Wellness routines and practices',
      'Sleep habits and preferences',
      'Mental health approaches',
    ],
    examples: [
      'Follows a vegetarian diet for health reasons',
      'Practices meditation every morning for 20 minutes',
      'Prefers natural remedies before trying medication',
    ],
    enabled: true,
  },
  {
    id: 'fitness',
    name: 'Fitness & Exercise',
    description:
      'Exercise habits, fitness goals, and physical activity preferences.',
    extractionHints: [
      'Types of exercise or sport',
      'Workout frequency and schedule',
      'Fitness goals',
      'Preferred gym or exercise environment',
      'Activity tracking and metrics',
    ],
    examples: [
      'Runs three times a week, usually in the morning',
      'Training for a half marathon in autumn',
      'Prefers bodyweight exercises over gym machines',
    ],
    enabled: true,
  },
  {
    id: 'travel',
    name: 'Travel & Exploration',
    description:
      'Travel preferences, experiences, and future travel plans.',
    extractionHints: [
      'Favourite destinations or places visited',
      'Travel style (budget, luxury, adventure, etc.)',
      'Upcoming travel plans',
      'Transportation preferences',
      'Accommodation preferences',
    ],
    examples: [
      'Loves visiting Japan and has been three times',
      'Prefers Airbnb over hotels for longer stays',
      'Planning a road trip through Scotland this summer',
    ],
    enabled: true,
  },
  {
    id: 'preferences',
    name: 'Personal Preferences',
    description:
      'General likes, dislikes, and personal tastes that shape daily choices.',
    extractionHints: [
      'Favourite colours, aesthetics, or styles',
      'Preferred brands or products',
      'Temperature and weather preferences',
      'Strong opinions on everyday things',
      'Sensory preferences (noise level, lighting, etc.)',
    ],
    examples: [
      'Prefers dark mode on all apps and devices',
      'Dislikes loud environments and avoids crowded bars',
      'Always chooses window seats on planes',
    ],
    enabled: true,
  },
  {
    id: 'dining',
    name: 'Food & Dining',
    description:
      'Food preferences, cooking habits, and restaurant choices.',
    extractionHints: [
      'Favourite cuisines and dishes',
      'Cooking habits and skill level',
      'Dining out preferences',
      'Food allergies and intolerances',
      'Meal planning and prep habits',
    ],
    examples: [
      'Loves Thai food and cooks pad thai regularly',
      'Allergic to shellfish',
      'Meal preps on Sundays for the work week',
    ],
    enabled: true,
  },
  {
    id: 'entertainment',
    name: 'Entertainment & Media',
    description:
      'Media consumption habits, favourite shows, games, and cultural interests.',
    extractionHints: [
      'Favourite movies, TV shows, or genres',
      'Music tastes and listening habits',
      'Gaming preferences and platforms',
      'Podcast or YouTube channels followed',
      'Reading habits (fiction, non-fiction, genres)',
    ],
    examples: [
      'Big fan of sci-fi movies, especially Blade Runner',
      'Listens to jazz and lo-fi while working',
      'Currently reading through the Discworld series',
    ],
    enabled: true,
  },
  {
    id: 'shopping',
    name: 'Shopping & Purchasing',
    description:
      'Shopping habits, brand preferences, and purchasing patterns.',
    extractionHints: [
      'Preferred shopping channels (online, in-store)',
      'Brand loyalties and preferences',
      'Budget consciousness and spending style',
      'Product research habits',
      'Subscription services used',
    ],
    examples: [
      'Prefers buying from local shops when possible',
      'Subscribes to a monthly coffee delivery service',
      'Researches extensively before making large purchases',
    ],
    enabled: true,
  },
  {
    id: 'education',
    name: 'Education & Background',
    description:
      'Educational background, qualifications, and academic experiences.',
    extractionHints: [
      'Degrees and qualifications',
      'Fields of study',
      'Educational institutions attended',
      'Academic interests',
      'Professional certifications',
    ],
    examples: [
      'Has a degree in computer science',
      'Completed an AWS Solutions Architect certification',
      'Studied abroad in Berlin for a semester',
    ],
    enabled: true,
  },
  {
    id: 'learning',
    name: 'Learning & Development',
    description:
      'Ongoing learning activities, courses, and skill development efforts.',
    extractionHints: [
      'Current courses or learning programs',
      'Skills being developed',
      'Learning style preferences',
      'Resources and platforms used for learning',
      'Knowledge gaps the user wants to fill',
    ],
    examples: [
      'Taking an online course on machine learning through Coursera',
      'Learns best through hands-on projects rather than lectures',
      'Wants to improve their public speaking skills',
    ],
    enabled: true,
  },
  {
    id: 'finances',
    name: 'Finances & Money',
    description:
      'Financial habits, attitudes towards money, and financial goals.',
    extractionHints: [
      'Saving and investing habits',
      'Financial goals and priorities',
      'Attitudes towards spending',
      'Budgeting practices',
      'Financial tools and services used',
    ],
    examples: [
      'Saving for a house deposit over the next two years',
      'Uses YNAB for budgeting',
      'Prefers index funds over individual stock picking',
    ],
    enabled: true,
  },
  {
    id: 'hobbies',
    name: 'Hobbies & Interests',
    description:
      'Recreational activities, creative pursuits, and passion projects.',
    extractionHints: [
      'Creative hobbies (art, music, writing, etc.)',
      'Outdoor activities and nature interests',
      'Collections and niche interests',
      'Time spent on hobbies',
      'Community involvement in hobby groups',
    ],
    examples: [
      'Plays guitar as a hobby and enjoys fingerstyle',
      'Enjoys birdwatching on weekend mornings',
      'Building a mechanical keyboard as a side project',
    ],
    enabled: true,
  },
  {
    id: 'technology',
    name: 'Technology & Tools',
    description:
      'Technology preferences, tools used, and technical setup.',
    extractionHints: [
      'Operating system and device preferences',
      'Software and apps used daily',
      'Programming languages and frameworks',
      'Smart home or IoT devices',
      'Tech philosophy (open source, privacy-focused, etc.)',
    ],
    examples: [
      'Uses a MacBook for work and Linux for personal projects',
      'Prefers VS Code with Vim keybindings',
      'Privacy-conscious and uses Firefox with uBlock Origin',
    ],
    enabled: true,
  },
  {
    id: 'communication',
    name: 'Communication Style',
    description:
      'How the user prefers to communicate and interact with others.',
    extractionHints: [
      'Preferred communication channels (email, chat, call)',
      'Writing style and tone preferences',
      'Meeting preferences',
      'Response time expectations',
      'Language and formality level',
    ],
    examples: [
      'Prefers Slack messages over email for quick questions',
      'Likes concise, bullet-point communication',
      'Avoids phone calls and prefers text-based communication',
    ],
    enabled: true,
  },
  {
    id: 'goals',
    name: 'Goals & Aspirations',
    description:
      'Short-term and long-term goals, ambitions, and life plans.',
    extractionHints: [
      'Career ambitions and milestones',
      'Personal development goals',
      'Life milestones being planned',
      'Bucket list items',
      'Timelines and deadlines for goals',
    ],
    examples: [
      'Wants to start their own business within five years',
      'Goal to read 50 books this year',
      'Planning to learn to sail next summer',
    ],
    enabled: true,
  },
  {
    id: 'projects',
    name: 'Projects & Creations',
    description:
      'Current and past projects, side projects, and creative works.',
    extractionHints: [
      'Active side projects and their tech stacks',
      'Open source contributions',
      'Creative works in progress',
      'Project goals and status',
      'Collaboration preferences for projects',
    ],
    examples: [
      'Building a personal finance tracker app in React',
      'Contributing to an open source CLI tool on GitHub',
      'Writing a blog series about distributed systems',
    ],
    enabled: true,
  },
  {
    id: 'routines',
    name: 'Routines & Habits',
    description:
      'Daily routines, productivity habits, and time management approaches.',
    extractionHints: [
      'Morning and evening routines',
      'Work schedule and deep focus times',
      'Productivity methods and tools',
      'Break and rest patterns',
      'Weekly or seasonal rhythms',
    ],
    examples: [
      'Wakes up at 6am and does a morning run before work',
      'Uses the Pomodoro technique for focused work sessions',
      'Takes a digital detox every Sunday',
    ],
    enabled: true,
  },
  {
    id: 'family',
    name: 'Family & Relationships',
    description:
      'Family structure, relationship context, and social connections (without identifying details).',
    extractionHints: [
      'Family structure (partner, children, pets)',
      'Relationship dynamics and priorities',
      'Social circle and friendship patterns',
      'Family traditions or activities',
      'Caregiving responsibilities',
    ],
    examples: [
      'Has a partner and two young children',
      'Owns a golden retriever named after a fictional character',
      'Close to their sibling and talks to them weekly',
    ],
    enabled: true,
  },
  {
    id: 'location',
    name: 'Location & Environment',
    description:
      'General geographic context and environment preferences (city/country level, not exact addresses).',
    extractionHints: [
      'City or region of residence',
      'Country and timezone',
      'Climate and weather context',
      'Urban vs rural setting',
      'Places frequently visited',
    ],
    examples: [
      'Lives in London, UK',
      'Works in Pacific timezone despite being on the East Coast',
      'Spends summers at a family cabin in the countryside',
    ],
    enabled: true,
  },
  {
    id: 'general_preferences',
    name: 'General Preferences',
    description:
      'Catch-all for preferences and facts that do not fit neatly into other categories.',
    extractionHints: [
      'Miscellaneous preferences and opinions',
      'Behavioural tendencies',
      'Pet peeves and things to avoid',
      'Default choices and go-to options',
      'Anything else worth remembering',
    ],
    examples: [
      'Always orders oat milk in coffee',
      'Dislikes being interrupted during deep work',
      'Prefers metric units over imperial',
    ],
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// Default PII Rules — keyword-based (22 entries)
// ---------------------------------------------------------------------------

const defaultKeywordPIIRules: PIIRule[] = [
  { id: 'pii_name', type: 'keyword', pattern: 'name', description: 'Generic name mention', enabled: true },
  { id: 'pii_full_name', type: 'keyword', pattern: 'full_name', description: 'Full name reference', enabled: true },
  { id: 'pii_first_name', type: 'keyword', pattern: 'first_name', description: 'First name reference', enabled: true },
  { id: 'pii_last_name', type: 'keyword', pattern: 'last_name', description: 'Last name reference', enabled: true },
  { id: 'pii_partner_name', type: 'keyword', pattern: 'partner_name', description: 'Partner name reference', enabled: true },
  { id: 'pii_spouse_name', type: 'keyword', pattern: 'spouse_name', description: 'Spouse name reference', enabled: true },
  { id: 'pii_child_name', type: 'keyword', pattern: 'child_name', description: 'Child name reference', enabled: true },
  { id: 'pii_pet_name', type: 'keyword', pattern: 'pet_name', description: 'Pet name reference', enabled: true },
  { id: 'pii_family_member', type: 'keyword', pattern: 'family_member', description: 'Family member name reference', enabled: true },
  { id: 'pii_age', type: 'keyword', pattern: 'age', description: 'Exact age reference', enabled: true },
  { id: 'pii_date_of_birth', type: 'keyword', pattern: 'date_of_birth', description: 'Date of birth reference', enabled: true },
  { id: 'pii_birthday', type: 'keyword', pattern: 'birthday', description: 'Birthday reference', enabled: true },
  { id: 'pii_address', type: 'keyword', pattern: 'address', description: 'Generic address reference', enabled: true },
  { id: 'pii_home_address', type: 'keyword', pattern: 'home_address', description: 'Home address reference', enabled: true },
  { id: 'pii_street_address', type: 'keyword', pattern: 'street_address', description: 'Street address reference', enabled: true },
  { id: 'pii_email', type: 'keyword', pattern: 'email', description: 'Email reference', enabled: true },
  { id: 'pii_email_address', type: 'keyword', pattern: 'email_address', description: 'Email address reference', enabled: true },
  { id: 'pii_phone', type: 'keyword', pattern: 'phone', description: 'Phone number reference', enabled: true },
  { id: 'pii_phone_number', type: 'keyword', pattern: 'phone_number', description: 'Phone number reference', enabled: true },
  { id: 'pii_password', type: 'keyword', pattern: 'password', description: 'Password reference', enabled: true },
  { id: 'pii_api_key', type: 'keyword', pattern: 'api_key', description: 'API key reference', enabled: true },
  { id: 'pii_secret', type: 'keyword', pattern: 'secret', description: 'Secret or token reference', enabled: true },
];

// ---------------------------------------------------------------------------
// Default PII Rules — regex-based (7 entries)
// ---------------------------------------------------------------------------

const defaultRegexPIIRules: PIIRule[] = [
  {
    id: 'pii_regex_email',
    type: 'regex',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    description: 'Matches email addresses',
    enabled: true,
  },
  {
    id: 'pii_regex_phone',
    type: 'regex',
    pattern: '(\\+?1[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}',
    description: 'Matches phone numbers (US/UK formats)',
    enabled: true,
  },
  {
    id: 'pii_regex_api_key',
    type: 'regex',
    pattern: '(sk|pk|api)[_-][a-zA-Z0-9]{20,}',
    description: 'Matches common API key patterns',
    enabled: true,
  },
  {
    id: 'pii_regex_password',
    type: 'regex',
    pattern: '(password|passwd|pwd)\\s*[:=]\\s*\\S+',
    description: 'Matches password assignments in text',
    enabled: true,
  },
  {
    id: 'pii_regex_ssn_ni',
    type: 'regex',
    pattern: '\\b\\d{3}-?\\d{2}-?\\d{4}\\b|\\b[A-Z]{2}\\d{6}[A-Z]\\b',
    description: 'Matches US SSN and UK NI number patterns',
    enabled: true,
  },
  {
    id: 'pii_regex_credit_card',
    type: 'regex',
    pattern: '\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b',
    description: 'Matches credit card number patterns',
    enabled: true,
  },
  {
    id: 'pii_regex_ip_address',
    type: 'regex',
    pattern: '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b',
    description: 'Matches IPv4 addresses',
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// Default Global Rules
// ---------------------------------------------------------------------------

const defaultGlobalRules: string[] = [
  'Never extract passwords, API keys, or secrets',
  'Never extract exact ages or dates of birth',
  'Focus on preferences, habits, and context — not identifying information',
];

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Returns the built-in default extraction schema.
 * This is a pure function with no side-effects.
 */
export function getDefaultSchema(): ExtractionSchema {
  return {
    categories: defaultCategories.map((c) => ({ ...c })),
    globalRules: [...defaultGlobalRules],
    piiRules: [
      ...defaultKeywordPIIRules.map((r) => ({ ...r })),
      ...defaultRegexPIIRules.map((r) => ({ ...r })),
    ],
  };
}

/**
 * Loads the user's schema from IndexedDB.
 * Falls back to the default schema if nothing is stored yet.
 */
export async function loadSchema(): Promise<StoredSchema> {
  const stored = await getSchema();
  if (stored) {
    return stored;
  }

  // Nothing persisted yet — build a StoredSchema from defaults
  const defaults = getDefaultSchema();
  const storedSchema: StoredSchema = {
    ...defaults,
    id: 'user-schema',
    updatedAt: Date.now(),
  };

  // Persist the defaults so subsequent loads are consistent
  await dbSaveSchema(storedSchema);
  return storedSchema;
}

/**
 * Saves an extraction schema to IndexedDB, stamping the current time.
 */
export async function saveSchema(schema: ExtractionSchema): Promise<void> {
  const storedSchema: StoredSchema = {
    ...schema,
    id: 'user-schema',
    updatedAt: Date.now(),
  };
  await dbSaveSchema(storedSchema);
}

/**
 * Resets the schema to built-in defaults and persists the result.
 */
export async function resetSchema(): Promise<void> {
  const defaults = getDefaultSchema();
  const storedSchema: StoredSchema = {
    ...defaults,
    id: 'user-schema',
    updatedAt: Date.now(),
  };
  await dbSaveSchema(storedSchema);
}
