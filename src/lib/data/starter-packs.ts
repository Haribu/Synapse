export interface StarterFeed {
  title: string;
  feedUrl: string;
  siteUrl?: string;
  description?: string;
  editorialType?: "independent" | "vendor" | "community" | "official" | "news";
}

export interface StarterPack {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string; // lucide icon identifier
  feeds: StarterFeed[];
}

export const STARTER_PACKS: StarterPack[] = [
  {
    id: "tech-engineering",
    name: "Technology & Engineering",
    description: "Deep technical essays, systems architecture, and computing culture.",
    category: "Technology",
    icon: "Cpu",
    feeds: [
      {
        title: "Ars Technica",
        feedUrl: "https://feeds.arstechnica.com/arstechnica/index",
        siteUrl: "https://arstechnica.com",
        description: "Original news and reviews, analysis of tech trends, and expert advice.",
        editorialType: "news",
      },
      {
        title: "Simon Willison's Weblog",
        feedUrl: "https://simonwillison.net/atom/entries/",
        siteUrl: "https://simonwillison.net",
        description: "Notes, links, and essays on software engineering, LLMs, and open source.",
        editorialType: "independent",
      },
      {
        title: "tonsky.me",
        feedUrl: "https://tonsky.me/blog/atom.xml",
        siteUrl: "https://tonsky.me",
        description: "Nikita Prokopov on UI, typography, Clojure, and software craftsmanship.",
        editorialType: "independent",
      },
      {
        title: "The Verge",
        feedUrl: "https://www.theverge.com/rss/index.xml",
        siteUrl: "https://www.theverge.com",
        description: "Technology news, reviews, and cultural reporting.",
        editorialType: "news",
      },
      {
        title: "Hacker News (Frontpage)",
        feedUrl: "https://news.ycombinator.com/rss",
        siteUrl: "https://news.ycombinator.com",
        description: "Top community-voted technology discussions and breaking computer science links.",
        editorialType: "community",
      },
    ],
  },
  {
    id: "ai-machine-learning",
    name: "AI & Machine Learning",
    description: "Frontier model architectures, alignment, research synthesis, and autonomous agents.",
    category: "Technology",
    icon: "Sparkles",
    feeds: [
      {
        title: "Lil'Log (Lilian Weng)",
        feedUrl: "https://lilianweng.github.io/index.xml",
        siteUrl: "https://lilianweng.github.io",
        description: "Exhaustive, rigorous deep dives into neural network architectures and agents.",
        editorialType: "independent",
      },
      {
        title: "Chip Huyen",
        feedUrl: "https://huyenchip.com/feed.xml",
        siteUrl: "https://huyenchip.com",
        description: "Production machine learning systems, evaluation, and AI engineering.",
        editorialType: "independent",
      },
      {
        title: "Sebastian Raschka (Ahead of AI)",
        feedUrl: "https://magazine.sebastianraschka.com/feed",
        siteUrl: "https://magazine.sebastianraschka.com",
        description: "Hands-on machine learning research breakdown and architecture analysis.",
        editorialType: "independent",
      },
      {
        title: "Import AI (Jack Clark)",
        feedUrl: "https://importai.substack.com/feed",
        siteUrl: "https://importai.substack.com",
        description: "Weekly newsletter on the technical frontiers and geopolitical policy of AI.",
        editorialType: "independent",
      },
    ],
  },
  {
    id: "cybersecurity-cti",
    name: "Cybersecurity & CTI",
    description: "Threat intelligence, vulnerability analysis, offensive security, and privacy.",
    category: "Cybersecurity",
    icon: "ShieldAlert",
    feeds: [
      {
        title: "Krebs on Security",
        feedUrl: "https://krebsonsecurity.com/feed/",
        siteUrl: "https://krebsonsecurity.com",
        description: "In-depth investigative reporting on cybercrime and national security.",
        editorialType: "independent",
      },
      {
        title: "Schneier on Security",
        feedUrl: "https://www.schneier.com/feed/atom/",
        siteUrl: "https://www.schneier.com",
        description: "Bruce Schneier's essays on cryptography, policy, and computer security.",
        editorialType: "independent",
      },
      {
        title: "BleepingComputer",
        feedUrl: "https://www.bleepingcomputer.com/feed/",
        siteUrl: "https://www.bleepingcomputer.com",
        description: "Fast-breaking cybersecurity news, ransomware telemetry, and vulnerability bulletins.",
        editorialType: "news",
      },
      {
        title: "Unsupervised Learning (Daniel Miessler)",
        feedUrl: "https://danielmiessler.com/feed",
        siteUrl: "https://danielmiessler.com",
        description: "Security, AI, and technology analysis curated for modern practitioners.",
        editorialType: "independent",
      },
    ],
  },
  {
    id: "world-economy",
    name: "World & Economy",
    description: "Global business, macroeconomics, tech strategy, and geopolitics.",
    category: "World & Economy",
    icon: "Globe",
    feeds: [
      {
        title: "Stratechery (Ben Thompson)",
        feedUrl: "https://stratechery.com/feed/",
        siteUrl: "https://stratechery.com",
        description: "Analysis of the business, strategy, and impact of technology and media.",
        editorialType: "independent",
      },
      {
        title: "Marginal Revolution",
        feedUrl: "https://marginalrevolution.com/feed",
        siteUrl: "https://marginalrevolution.com",
        description: "Tyler Cowen and Alex Tabarrok on economics, books, markets, and ideas.",
        editorialType: "independent",
      },
      {
        title: "Financial Times Alphaville",
        feedUrl: "https://www.ft.com/alphaville?format=rss",
        siteUrl: "https://www.ft.com/alphaville",
        description: "Sharp commentary and irreverent market intelligence on global finance.",
        editorialType: "news",
      },
    ],
  },
  {
    id: "design-culture",
    name: "Design & Indie Web",
    description: "Art, typography, product design, and independent curation.",
    category: "Culture",
    icon: "Palette",
    feeds: [
      {
        title: "kottke.org",
        feedUrl: "https://feeds.kottke.org/main",
        siteUrl: "https://kottke.org",
        description: "One of the oldest blogs on the web, covering design, science, and visual art.",
        editorialType: "independent",
      },
      {
        title: "Smashing Magazine",
        feedUrl: "https://www.smashingmagazine.com/feed/",
        siteUrl: "https://www.smashingmagazine.com",
        description: "Practical editorial for web designers and frontend engineers.",
        editorialType: "news",
      },
      {
        title: "Dense Discovery",
        feedUrl: "https://www.densediscovery.com/feed.xml",
        siteUrl: "https://www.densediscovery.com",
        description: "Curated inspiration at the intersection of design, sustainability, and tech.",
        editorialType: "independent",
      },
    ],
  },
];
