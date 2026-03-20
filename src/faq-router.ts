export interface FaqMatch {
  intent: string;
  reply: string;
}

interface FaqIntent {
  intent: string;
  /** Phrases that map to this intent (all lowercase, trimmed). */
  phrases: string[];
  /** Keywords that, if all present in the message, match this intent. */
  keywords: string[][];
  reply: string;
}

const intents: FaqIntent[] = [
  {
    intent: "greeting",
    phrases: [
      "hi",
      "hey",
      "hello",
      "howdy",
      "sup",
      "whats up",
      "yo",
      "hiya",
      "hey there",
      "hello there",
      "hi there",
      "good morning",
      "good afternoon",
      "good evening",
    ],
    keywords: [],
    reply:
      "Hey! I'm RioBot, here to help you learn about Rio Edwards and his work. " +
      "Feel free to ask about his background, projects, skills, or anything else!",
  },
  {
    intent: "who_is_rio",
    phrases: [
      "who is rio",
      "who is rio edwards",
      "tell me about rio",
      "what does rio do",
      "who are you",
      "what is this",
      "whats this about",
    ],
    keywords: [
      ["who", "rio"],
      ["about", "rio"],
    ],
    reply:
      "Rio Edwards is a product-minded full-stack TypeScript engineer based in Portland, Oregon. " +
      "He has strong React and Next.js experience and a track record of shipping production software " +
      "across client work, self-hosted products, developer tooling, and teaching. " +
      "Feel free to ask about specific projects, skills, or experience!",
  },
  {
    intent: "work_experience",
    phrases: [
      "whats rios work experience",
      "what is rios work experience",
      "what's rio's work experience",
      "what is rio's work experience",
      "whats rio work experience",
      "what is rio work experience",
      "work experience",
      "experience",
      "his work experience",
    ],
    keywords: [
      ["work", "experience"],
      ["professional", "experience"],
    ],
    reply:
      "Rio's recent work experience includes:\n\n" +
      "- **Co-founder and Product Engineer at Experiential (Jul 2024 - Nov 2025)**: led client projects end-to-end from requirements and design through architecture and delivery\n" +
      "- **Cohort Instructional Lead at Code the Dream (Sep 2024 - Jun 2025)**: taught 200+ students and delivered detailed engineering feedback\n" +
      "- **Student Mentor at Code the Dream (Jan 2024 - Nov 2024)**: supported learners in office hours, lectures, and async mentoring\n" +
      "- **Frontend Engineer at Code for PDX (Sep 2023 - Nov 2024)**: contributed accessible, tested UI in a civic-tech codebase\n\n" +
      "If you want, I can break this down by role type like product engineering, frontend, teaching, or mentoring.",
  },
  {
    intent: "tech_stack",
    phrases: [
      "whats rios tech stack",
      "what is rios tech stack",
      "what's rio's tech stack",
      "what is rio's tech stack",
      "whats his tech stack",
      "what is his tech stack",
      "tech stack",
      "stack",
      "what technologies does he use",
    ],
    keywords: [
      ["tech", "stack"],
      ["technology", "stack"],
      ["what", "stack"],
    ],
    reply:
      "Rio's core stack is **TypeScript + React/Next.js** for frontend and product work, with Node/Express on the backend.\n\n" +
      "He also works with:\n" +
      "- **Mobile**: React Native, Swift, SwiftUI\n" +
      "- **Data**: PostgreSQL, Drizzle ORM, SQLite\n" +
      "- **Infra/Cloud**: Docker, NGINX, AWS, GCP, GitHub Actions, Vercel\n" +
      "- **Testing/Quality**: Playwright, Jest, CI/CD\n\n" +
      "If you're hiring for a specific role, I can map this to the exact stack match.",
  },
  {
    intent: "strongest_projects",
    phrases: [
      "what are his best projects",
      "what are his strongest projects",
      "show me his work",
      "what has he built",
      "what projects has he done",
      "top projects",
      "best work",
    ],
    keywords: [
      ["best", "project"],
      ["strongest", "project"],
      ["top", "project"],
    ],
    reply:
      "Rio's strongest projects are:\n\n" +
      "- **CRM Document Manager** - HIPAA-compliant document management inside HubSpot, used daily by 30+ professionals\n" +
      "- **DogTown** - Self-hosted photo-sharing app on a Raspberry Pi with OAuth, AI moderation, and real-time monitoring\n" +
      "- **Ohm on the Range** - Festival website redesign that doubled traffic with near-perfect Lighthouse scores\n" +
      "- **Digital Wellness App** - Native iOS app tracking screen time via Live Activities\n\n" +
      "Want to hear more about any of these?",
  },
  {
    intent: "dogtown",
    phrases: [
      "tell me about dogtown",
      "what is dogtown",
      "whats dogtown",
      "what's dogtown",
      "dogtown",
      "can you tell me about dogtown",
    ],
    keywords: [
      ["about", "dogtown"],
      ["tell", "dogtown"],
    ],
    reply:
      "DogTown is a self-hosted photo-sharing app Rio built and runs in production on a Raspberry Pi 5.\n\n" +
      "Highlights:\n" +
      "- OAuth-based auth and full-stack TypeScript architecture\n" +
      "- AI moderation service (DogBot) built with Python/FastAPI\n" +
      "- Real-time system monitoring dashboard via SSE\n" +
      "- NGINX image caching and upload processing to improve reliability\n\n" +
      "It is one of his best examples of end-to-end ownership across product, backend, and infrastructure.",
  },
  {
    intent: "backend_experience",
    phrases: [
      "does he do backend",
      "backend experience",
      "does he only do frontend",
      "is he just a frontend developer",
      "server side experience",
    ],
    keywords: [["backend"], ["server", "side"]],
    reply:
      "Rio is not just a frontend developer. While frontend is a major strength, he also works across " +
      "backend APIs, auth systems, infrastructure, CI/CD, cloud services, observability, and deployment. " +
      "DogTown is a strong example, with its Node/Postgres backend, Docker Compose setup, NGINX caching, " +
      "and Python/FastAPI moderation microservice.",
  },
  {
    intent: "mobile_experience",
    phrases: [
      "does he do mobile",
      "mobile experience",
      "ios experience",
      "react native experience",
      "has he built apps",
      "mobile apps",
    ],
    keywords: [["mobile"], ["ios"], ["react", "native"]],
    reply:
      "Yes! Rio has real mobile experience on both sides:\n\n" +
      "- **React Native**: Built the full cross-platform client for Talerra, a travel storytelling app\n" +
      "- **Native iOS**: Built a digital wellness app in Swift/SwiftUI with Live Activities, " +
      "Screen Time APIs, and 5 sandboxed extensions\n\n" +
      "Want details on either project?",
  },
  {
    intent: "location",
    phrases: [
      "where is he located",
      "where does he live",
      "where is rio based",
      "location",
      "is he remote",
      "where is he",
    ],
    keywords: [
      ["where", "located"],
      ["where", "live"],
      ["where", "based"],
    ],
    reply:
      "Rio is based in Portland, Oregon. He is a U.S. citizen (no sponsorship required), " +
      "open to travel, and open to relocation, including internationally.",
  },
  {
    intent: "contact",
    phrases: [
      "how can i contact him",
      "how do i reach rio",
      "contact info",
      "contact information",
      "email",
      "linkedin",
      "how to get in touch",
    ],
    keywords: [["contact"], ["reach", "rio"], ["get", "touch"]],
    reply:
      "You can reach Rio through:\n\n" +
      "- **Email**: rioredwards@gmail.com\n" +
      "- **LinkedIn**: linkedin.com/in/rio-edwards\n" +
      "- **GitHub**: github.com/rioredwards\n" +
      "- **Website**: rioedwards.com",
  },
];

/**
 * Normalize a message for matching: lowercase, strip punctuation, collapse whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if a whole word exists in the text (word boundary matching). */
function containsWord(text: string, word: string): boolean {
  const pattern = new RegExp(`\\b${word}\\b`);
  return pattern.test(text);
}

/**
 * Try to match a user message to a FAQ intent.
 * Returns the match if confidence is high, or null to fall through to the LLM.
 */
export function matchFaq(message: string): FaqMatch | null {
  const normalized = normalize(message);

  // 1. Exact phrase match (highest confidence)
  for (const intent of intents) {
    if (intent.phrases.some((phrase) => normalize(phrase) === normalized)) {
      return { intent: intent.intent, reply: intent.reply };
    }
  }

  // 2. Keyword match (all keywords in a group must be present as whole words)
  for (const intent of intents) {
    for (const keywordGroup of intent.keywords) {
      if (keywordGroup.every((kw) => containsWord(normalized, kw))) {
        return { intent: intent.intent, reply: intent.reply };
      }
    }
  }

  return null;
}
