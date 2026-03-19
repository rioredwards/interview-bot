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
    keywords: [["who", "rio"], ["about", "rio"]],
    reply:
      "Rio Edwards is a product-minded full-stack TypeScript engineer based in Portland, Oregon. " +
      "He has strong React and Next.js experience and a track record of shipping production software " +
      "across client work, self-hosted products, developer tooling, and teaching. " +
      "Feel free to ask about specific projects, skills, or experience!",
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
    keywords: [["best", "project"], ["strongest", "project"], ["top", "project"]],
    reply:
      "Rio's strongest projects are:\n\n" +
      "- **CRM Document Manager** - HIPAA-compliant document management inside HubSpot, used daily by 30+ professionals\n" +
      "- **DogTown** - Self-hosted photo-sharing app on a Raspberry Pi with OAuth, AI moderation, and real-time monitoring\n" +
      "- **Ohm on the Range** - Festival website redesign that doubled traffic with near-perfect Lighthouse scores\n" +
      "- **Digital Wellness App** - Native iOS app tracking screen time via Live Activities\n\n" +
      "Want to hear more about any of these?",
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
    keywords: [["where", "located"], ["where", "live"], ["where", "based"]],
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
    .replace(/['']/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Try to match a user message to a FAQ intent.
 * Returns the match if confidence is high, or null to fall through to the LLM.
 */
export function matchFaq(message: string): FaqMatch | null {
  const normalized = normalize(message);

  // 1. Exact phrase match (highest confidence)
  for (const intent of intents) {
    if (intent.phrases.includes(normalized)) {
      return { intent: intent.intent, reply: intent.reply };
    }
  }

  // 2. Keyword match (all keywords in a group must be present)
  for (const intent of intents) {
    for (const keywordGroup of intent.keywords) {
      if (keywordGroup.every((kw) => normalized.includes(kw))) {
        return { intent: intent.intent, reply: intent.reply };
      }
    }
  }

  return null;
}
