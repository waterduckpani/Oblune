import type { Phase } from '../lib/phase';

/** A step of the product's flow, and the real screens that show it (texture names in /work/tex/<slug>/). */
export type Step = { title: string; text: string; phone?: string; desktop?: string };

export type CategoryId = 'apps' | 'ai' | 'web' | 'commerce';
export type Category = { id: CategoryId; label: string; plural: string; blurb: string };

/** The four kinds of work, in the order the home page tells them. */
export const categories: Category[] = [
  { id: 'apps', label: 'Apps', plural: 'iOS apps', blurb: 'Two iOS apps in Flutter, each designed screen by screen and carried through to its backend.' },
  { id: 'ai', label: 'AI', plural: 'AI tools', blurb: 'An agent runtime and a field assistant. Both put a person in charge of every decision that matters.' },
  { id: 'web', label: 'Web', plural: 'Web platforms', blurb: 'Two daily publications, one that writes itself and one with a globe you can turn, and a course that teaches with live market data.' },
  { id: 'commerce', label: 'E-commerce', plural: 'Client storefronts', blurb: 'Shopify stores for brands: design, build, payments and the details that turn a visit into an order.' },
];

/** A screen from the work, for galleries and devices. */
export type Shot = { src: string; kind: 'phone' | 'desktop'; alt: string };

export type Project = {
  slug: string;
  name: string;
  category: CategoryId;
  phase: Phase;
  statusNote: string;
  /** Who it was for: my own product, a client, or a competition. */
  context: { kind: 'product' | 'client' | 'hackathon' | 'open-source' | 'cofounder'; label: string };
  line: string;
  summary: string;
  kind: string;
  stack: string[];
  year: string;
  /** When the work happened, from the resume. */
  timeline: string;
  role: string[];
  /** Still image for no-WebGL and reduced data. */
  image: { base: string; alt: string };
  /** The stage behind the devices: a moon in the product's own colour, lit to its phase. */
  stage: { bg: string; glow: string; tone: 'light' | 'dark' };
  /**
   * The live product, if there is one. `embed` means the site allows being framed, so it opens
   * running in the live window; otherwise its links simply open the real site in a new tab.
   */
  live?: { href: string; label: string; host: string; embed?: boolean };
  /** The public repository, browsable inside the site. */
  repo?: { slug: string; url: string };
  /** The big closing link after the steps on the home page. */
  cta: { label: string; href: string; note: string; command?: string };
  /** The product's flow. Each step changes what the devices show. */
  steps: Step[];
  /**
   * The case study's numbers: real, checkable facts about scale, speed or reach, never slogans.
   * `unit` is set small after the value; `source` says where the number comes from.
   */
  metrics: { value: string; unit?: string; label: string; source?: string }[];
  brief: string[];
  decisions: { title: string; text: string }[];
  /** How it works, as a pipeline from input to result. */
  flow: { title: string; text: string }[];
  outcome: string;
  shots: Shot[];
  /** A command worth copying, shown in the case study hero. */
  command?: string;
};

const gh = (name: string) => `https://github.com/waterduckpani/${name}`;
const tex = (slug: string, n: string) => `/work/tex/${slug}/${n}.webp`;

export const projects: Project[] = [
  // ---------------------------------------------------------------- Apps
  {
    slug: 'mull',
    name: 'Mull',
    category: 'apps',
    phase: 'gibbous',
    statusNote: 'Ready for the App Store',
    context: { kind: 'product', label: 'My own product' },
    line: 'Split money with the people you live with. Settle over UPI.',
    summary:
      'Shared expenses for flats, trips and dinners in India. One number per person, payments confirmed by the person who was paid, and monthly bills that ask before they add.',
    kind: 'iOS app',
    stack: ['Flutter', 'Supabase', 'Postgres', 'APNs', 'UPI'],
    year: '2026',
    timeline: 'Sep 2026 to now',
    role: ['Product design', 'iOS engineering', 'Backend and sync', 'Launch site'],
    image: { base: '/work/mull', alt: 'Mull screens in the dark theme: the home screen showing ₹6,050 owed, a payment to confirm, a monthly bill, and the launch site mullapp.in.' },
    stage: { bg: '#0f0f11', glow: '#26262a', tone: 'dark' },
    live: { href: 'https://www.mullapp.in', label: 'Visit mullapp.in', host: 'mullapp.in' },
    repo: { slug: 'mull', url: gh('Mull') },
    cta: { label: 'Visit mullapp.in', href: 'https://www.mullapp.in', note: 'The launch site, designed and built alongside the app.' },
    steps: [
      { title: 'One number per person, across every ledger', text: 'The flat and the Goa trip net off against each other. You see what you owe each friend, once.', phone: 'home' },
      { title: 'Claimed, then confirmed by the person paid', text: 'Money moves over UPI, never through Mull. A payment only counts when the person who got it says it arrived.', phone: 'claim' },
      { title: 'Monthly bills that ask before they add', text: 'Rent and house help come back each month, and Mull checks with you before adding them.', phone: 'recurring_due' },
      { title: 'A launch site, built alongside the app', text: 'mullapp.in tells the same story as a live constellation: six friends, one trip, one honest number each.', phone: 'site_m', desktop: 'site_hero' },
    ],
    metrics: [
      { value: '10', unit: 'days', label: 'from the repository’s first commit to version 1.0, ready for App Store review', source: 'GitHub, 19 to 29 Sep 2026' },
      { value: '45', label: 'commits, from the first sketch to the finished 1.0', source: 'GitHub' },
      { value: '23', label: 'database migrations, with row-level security on every table', source: 'supabase/migrations' },
      { value: '24', label: 'test files across the app and its backend', source: 'The repository' },
    ],
    brief: [
      'Splitting money in India runs on UPI, and every expense app I tried was built for somewhere else. They asked you to trust a single tap that said someone had paid, they coloured debts red and green like a bank statement, and they kept your flat and your trip in separate worlds.',
      'I wanted one honest number for each friend, a payment that only counts once the other person confirms it, and rent that reminds you instead of quietly adding itself.',
    ],
    decisions: [
      { title: 'Net off, not add up', text: 'If you owe Ananya ₹2,000 for the trip and she owes you ₹3,000 for the flat, Mull says she owes you ₹1,000. Debts merge across groups into one balance per person, then the fewest payments that clear it.' },
      { title: 'Claimed, then confirmed', text: 'The payer claims a payment and the payee confirms it arrived. Database triggers freeze a confirmed payment, so no balance moves on one unverified tap and a modified client gets nowhere.' },
      { title: 'No colour, ever', text: 'Owing and being owed are told apart by words and weight, never by red and green. Hierarchy comes from how high a surface floats, with exactly one focal object per screen.' },
      { title: 'The phone is the source of truth', text: 'Every edit lands in a file on the phone first, so Mull works on a train. Sync sends only the rows that changed, and only pulls groups whose revision moved.' },
    ],
    flow: [
      { title: 'Flutter UI', text: 'Every edit applies locally first.' },
      { title: 'MullStore', text: 'mull.json on the phone. Works offline, pushes only what changed.' },
      { title: 'Supabase, Mumbai', text: 'Postgres with row-level security on every table. Seats, not users, so you can split with someone before they sign up.' },
      { title: 'Triggers', text: 'Freeze confirmed payments, publish to one private realtime topic per user, and send pushes through APNs.' },
      { title: 'UPI', text: 'Tapping Pay opens your UPI app with the amount and the person filled in. Mull never touches the money.' },
    ],
    outcome: 'Version 1.0.0 is finished and prepared for its first App Store release in India, with mullapp.in live as its launch site.',
    shots: [
      { src: tex('mull', 'home'), kind: 'phone', alt: 'Mull home: ₹6,050 owed to you, across a flat and a trip.' },
      { src: tex('mull', 'goa'), kind: 'phone', alt: 'The Goa trip group, ₹2,400 to get back.' },
      { src: tex('mull', 'owes'), kind: 'phone', alt: 'Who owes who, one line per person.' },
      { src: tex('mull', 'claim'), kind: 'phone', alt: 'A payment waiting for the person paid to confirm it.' },
      { src: tex('mull', 'recurring_due'), kind: 'phone', alt: 'A monthly bill asking before it adds itself.' },
      { src: tex('mull', 'settle'), kind: 'phone', alt: 'Settle up: the fewest payments that clear the group.' },
      { src: tex('mull', 'site_hero'), kind: 'desktop', alt: 'mullapp.in: Mull splits the bill, UPI settles it.' },
      { src: tex('mull', 'site_number'), kind: 'desktop', alt: 'mullapp.in: one honest number each.' },
    ],
  },
  {
    slug: 'bite',
    name: 'Bite',
    category: 'apps',
    phase: 'gibbous',
    statusNote: 'Ready for the App Store',
    context: { kind: 'product', label: 'My own product' },
    line: 'The news as a deck you swipe.',
    summary:
      'Four gestures teach a recommendation engine what you care about. Every story arrives as an 80-word bite and always links out to the publisher that wrote it.',
    kind: 'iOS app',
    stack: ['Flutter', 'Supabase', 'pgvector', 'Deno edge functions', 'Gemini Flash'],
    year: '2026',
    timeline: 'Jul 2026 to now',
    role: ['Product design', 'iOS engineering', 'Recommendation engine', 'Data pipelines'],
    image: { base: '/work/bite', alt: 'Bite screens: the swipeable news feed, a saved story and the algorithm view.' },
    stage: { bg: '#e6e0d3', glow: '#f5f2ea', tone: 'light' },
    repo: { slug: 'bite', url: gh('Bite') },
    cta: { label: 'Read the source', href: gh('Bite'), note: 'The Flutter app, the edge functions and the ranker.' },
    steps: [
      { title: 'Swipe right to read', text: 'A story you read at the publisher counts as a strong signal. Bite is a referrer, not a replacement.', phone: 'swipe' },
      { title: 'Swipe left to skip', text: 'Skips are feedback too. The feed learns what to show less of.', phone: 'feed' },
      { title: 'Swipe down to save', text: 'Saved stories wait for later, and saves pull the feed hardest toward a topic.', phone: 'saved' },
      { title: 'Every swipe teaches the feed', text: 'A taste model on pgvector, with one exploratory card in six so the feed never closes in on you.', phone: 'algorithm' },
    ],
    metrics: [
      { value: '16', label: 'edge functions run the feed: fetching, summarising, ranking and pushing', source: 'supabase/functions' },
      { value: '29', label: 'database migrations, including the vector index the recommender reads', source: 'supabase/migrations' },
      { value: '80', unit: 'words', label: 'at most in a bite, a cap enforced in code rather than asked of the model', source: 'The summariser' },
      { value: '1 in 6', label: 'cards is chosen from outside your taste, so the feed keeps discovering', source: 'The ranker' },
    ],
    brief: [
      'News apps either hand you an endless list of headlines or keep you inside their own reader, taking the reader away from the publisher who did the work.',
      'Bite turns the news into a deck of cards. Every swipe is a signal to a taste model, every story is rewritten into a short bite you can read on the card, and every card sends you to the publisher’s own page.',
    ],
    decisions: [
      { title: 'A referrer, not a replacement', text: 'There is no native reader. Attribution is a required column, so a card cannot render without the publisher, and click-through is recorded per publisher so it is a number, not a claim.' },
      { title: 'A taste model you can’t get trapped in', text: 'Your taste is a weighted centroid of what you read and save, pushed away from what you skip. A topic penalty stops one category flooding the deck, and one card in six is chosen off-taste on purpose.' },
      { title: 'The feed waits for the bite', text: 'A story without its summary waits for the next run instead of showing up bare, and the 80-word cap is enforced in code so the model can’t drift past it.' },
      { title: 'Crawl politely', text: 'One honest user agent, robots.txt and Crawl-delay honoured per domain, and any paywall or bot challenge aborts the fetch. Each publisher is vetted by a script before it is added.' },
    ],
    flow: [
      { title: 'Publisher RSS', text: 'A vetted, version-controlled registry of feeds. robots.txt honoured.' },
      { title: 'ingest-rss', text: 'Every six hours: deduplicate, and a fair share per outlet.' },
      { title: 'Postgres and pgvector', text: 'Embedded with gte-small, summarised into a bite, and matched to the stories you follow.' },
      { title: 'get_personalized_feed()', text: 'Taste, category and recency, minus a topic penalty, plus a region boost. One card in six exploratory.' },
      { title: 'The deck', text: 'Left rejects, right reads, down saves, up opens. Every swipe flows back as a signal.' },
    ],
    outcome: 'Works end to end on iOS, with account deletion, a privacy manifest and publisher reporting in place. The App Store release is on hold pending legal clearance.',
    shots: [
      { src: tex('bite', 'swipe'), kind: 'phone', alt: 'The Bite deck, with a story card to swipe.' },
      { src: tex('bite', 'feed'), kind: 'phone', alt: 'A bite: the story in under 80 words.' },
      { src: tex('bite', 'follow'), kind: 'phone', alt: 'Following a developing story.' },
      { src: tex('bite', 'saved'), kind: 'phone', alt: 'Saved stories for later.' },
      { src: tex('bite', 'discover'), kind: 'phone', alt: 'Discover, by topic.' },
      { src: tex('bite', 'algorithm'), kind: 'phone', alt: 'Your algorithm, shown to you.' },
      { src: tex('bite', 'feed_dark'), kind: 'phone', alt: 'The feed in the dark theme.' },
    ],
  },

  // ---------------------------------------------------------------- AI
  {
    slug: 'alfard',
    name: 'Alfard',
    category: 'ai',
    phase: 'full',
    statusNote: 'Live on PyPI and npm',
    context: { kind: 'open-source', label: 'Open source, MIT' },
    line: 'AI agents that ask before they act.',
    summary:
      'A local runtime for AI agents with persistent memory, connected to the tools you already use. Every irreversible action stops at an approval gate, and every decision is logged.',
    kind: 'Command-line tool',
    stack: ['Python', 'SQLite', 'MCP', 'GitHub Actions', 'Ollama or any model'],
    year: '2026',
    timeline: 'May 2026 to now',
    role: ['Architecture', 'Python engineering', 'Security model', 'CLI design'],
    image: { base: '/work/alfard', alt: 'An Alfard terminal session: an agent asks for approval before sending an email reply, and the user approves.' },
    stage: { bg: '#15130f', glow: '#3a2f1a', tone: 'dark' },
    live: { href: 'https://pypi.org/project/alfard', label: 'Alfard on PyPI', host: 'pypi.org' },
    repo: { slug: 'alfard', url: gh('alfard') },
    cta: { label: 'Install Alfard', href: 'https://www.npmjs.com/package/alfard-cli', note: 'One line in your terminal. It installs itself and launches.', command: 'npx alfard-cli' },
    command: 'npx alfard-cli',
    steps: [
      { title: 'The agent drafts a reply from your inbox', text: 'Terminal, Telegram, Discord and Slack share one agent and one memory. Any model, including fully local ones.' },
      { title: 'Irreversible, so it stops and asks', text: 'The gate shows the tool, the arguments and where the request came from. It cannot be bypassed.' },
      { title: 'Approved, sent and logged', text: 'Every call, decision and event lands in audit.jsonl, with a UTC timestamp.' },
    ],
    metrics: [
      { value: '6,800+', label: 'installs from PyPI and npm since the first release in May', source: 'pypistats.org and npm, to 30 Sep 2026' },
      { value: '29', label: 'releases in four months, from v0.1.0 to v0.1.28', source: 'PyPI' },
      { value: '174', label: 'commits, and a first contribution from a developer I have never met', source: 'GitHub' },
      { value: '4', label: 'channels on one agent and one memory: Telegram, Slack, Discord and the terminal', source: 'The README' },
    ],
    brief: [
      'Agents that can send email, file issues and move money are useful right up until they do something you didn’t mean. Most runtimes treat safety as a prompt, and most send your data somewhere you can’t see.',
      'Alfard runs on your own machine. Before anything irreversible happens it stops and asks you, on whichever channel you’re using, and it writes down what you said.',
    ],
    decisions: [
      { title: 'The gate is structural', text: 'Every tool is registered at startup as reversible or irreversible, so an unclassified call is impossible. Irreversible calls halt and show the tool, the arguments and where the request came from.' },
      { title: 'Memory you approve', text: 'A reflect cycle proposes what the agent should remember. You approve or reject each proposal before it writes, rejected ones never come back, and secrets are blocked before any write.' },
      { title: 'Three layers against injection', text: 'A sanitiser, a behavioural gate and a strip safety net keep web content from steering the agent, and sanitised content is attributed to its source before it reaches the model.' },
      { title: 'Nothing leaves the machine', text: 'Credentials are Fernet-encrypted with the key in your OS keychain, file work happens on a disposable git branch, and there is no telemetry.' },
    ],
    flow: [
      { title: 'Channels', text: 'Terminal, Telegram, Discord and Slack.' },
      { title: 'Agent', text: 'soul.md, skills and brain.db, its typed memory.' },
      { title: 'Tool registry', text: 'Classifies every tool as reversible or irreversible.' },
      { title: 'Approval gate', text: 'Irreversible calls wait for y or n, on every channel, with no bypass.' },
      { title: 'Sandbox and audit', text: 'Each call runs in its own process with a 30-second limit, and lands in audit.jsonl in UTC.' },
    ],
    outcome: 'Live on PyPI and npm under the MIT licence, installed more than 6,800 times with one line, with a first contribution already in from a developer I have never met.',
    shots: [],
  },
  {
    slug: 'haqdar',
    name: 'Haqdar',
    category: 'ai',
    phase: 'half',
    statusNote: 'Working prototype',
    context: { kind: 'hackathon', label: 'Finalist, USAII Global AI Hackathon 2026' },
    line: 'From one voice note to a welfare claim.',
    summary:
      'A Telegram assistant for field workers in India. Record a family’s answers in any Indian language and Haqdar returns the government schemes they are likely entitled to, with the reasons and the sources.',
    kind: 'Telegram bot',
    stack: ['Python', 'Telegram Bot API', 'Whisper on MLX', 'OpenRouter', 'Supabase'],
    year: '2026',
    timeline: 'June 2026',
    role: ['Concept', 'Conversation design', 'Python engineering', 'On-device speech'],
    image: { base: '/work/haqdar', alt: 'Three Haqdar screens in Telegram: the intake checklist and voice note, the matched schemes, and the reasoning for one scheme.' },
    stage: { bg: '#123c42', glow: '#1f5a5e', tone: 'dark' },
    repo: { slug: 'haqdar', url: gh('haqdar') },
    cta: { label: 'Read the source', href: gh('haqdar'), note: 'The bot, the Whisper server and the matching rules.' },
    steps: [
      { title: 'One voice note, in any Indian language', text: 'The worker speaks the family’s answers to a fixed checklist. Whisper transcribes on-device, on Apple Silicon.', phone: 'record' },
      { title: 'Verify the profile before anything runs', text: 'An LLM turns speech into a typed profile. The worker corrects any field in place, then matching starts.', phone: 'verify' },
      { title: 'The schemes they are likely entitled to', text: 'Every scheme starts as not eligible, with hard exclusions, so the list is never padded.', phone: 'matches' },
      { title: 'Know why, and what to check first', text: 'Each match explains itself and links the official source, all inside one Telegram message.', phone: 'why' },
    ],
    metrics: [
      { value: 'Finalist', label: 'at the USAII Global AI Hackathon 2026', source: 'USAII' },
      { value: '1', unit: 'voice note', label: 'per family, in any Indian language, in place of a paper form', source: 'The intake' },
      { value: '2', unit: 'groups', label: 'Likely and Possibly, each match with its reasons and what is left to confirm', source: 'The matcher' },
    ],
    brief: [
      'India runs hundreds of welfare schemes, and the families who qualify are often the least able to find them. The rules are scattered, in English and buried in PDFs, and a field worker sitting with a family has minutes, not hours.',
      'Haqdar, Hindi and Urdu for the rightful claimant, collapses that into one voice note. I built it for the USAII Global AI Hackathon 2026, where it reached the finals.',
    ],
    decisions: [
      { title: 'Strict by design', text: 'Every scheme starts as not eligible, and hard exclusions apply: rooftop solar needs a roof, scholarships need a child in range. A family should get a short true list, not a long hopeful one.' },
      { title: 'Verify before matching', text: 'The profile appears as an editable card. The worker fixes any field in place, and matching only runs when they tap Generate, so a mishearing never becomes a wrong claim.' },
      { title: 'Audio stays on the machine', text: 'Whisper large-v3 runs locally on Apple Silicon through MLX, so a family’s voice is never sent to a speech API.' },
      { title: 'Built for the field', text: 'Everything happens in one Telegram message that edits itself: overview, per-scheme detail, full text. State survives restarts, so a worker is never left hanging.' },
    ],
    flow: [
      { title: 'Field worker', text: 'Records the family’s answers to a fixed checklist, in any Indian language.' },
      { title: 'Whisper server', text: 'FastAPI and MLX Whisper large-v3 transcribe and translate on-device.' },
      { title: 'LLM extraction', text: 'Speech becomes a typed family profile: income, category, housing, land, ration card.' },
      { title: 'Verify card', text: 'The worker corrects any field before a single matching call runs.' },
      { title: 'Report', text: 'Likely and Possibly, each with the reasoning and the official source.' },
    ],
    outcome: 'A working prototype, tested end to end against live schemes with test families, and a finalist at the USAII Global AI Hackathon 2026.',
    shots: [
      { src: tex('haqdar', 'record'), kind: 'phone', alt: 'The intake checklist, answered in one voice note.' },
      { src: tex('haqdar', 'verify'), kind: 'phone', alt: 'The profile, ready to verify.' },
      { src: tex('haqdar', 'matches'), kind: 'phone', alt: 'The matched schemes: likely and possibly.' },
      { src: tex('haqdar', 'why'), kind: 'phone', alt: 'Why a scheme matched, and what to check first.' },
    ],
  },

  // ---------------------------------------------------------------- Web
  {
    slug: 'article',
    name: 'Article',
    category: 'web',
    phase: 'full',
    statusNote: 'Live, publishing daily',
    context: { kind: 'product', label: 'My own publication' },
    line: 'AI news in plain English, every morning.',
    summary:
      'A publication that runs itself. Stories are gathered from more than fifty sources, rewritten for people new to AI and emailed at 7am, with no editor in the loop. More than 500 stories so far.',
    kind: 'Publication',
    stack: ['Next.js', 'TypeScript', 'Supabase', 'OpenRouter', 'Resend', 'Vercel'],
    year: '2026',
    timeline: 'June 2026 to now',
    role: ['Editorial design', 'Next.js engineering', 'AI pipeline', 'Newsletter'],
    image: { base: '/work/article', alt: 'The Article homepage on desktop, “What’s actually happening in AI, explained like a smart friend would”, and a story on mobile.' },
    stage: { bg: '#ecd9a8', glow: '#f7ecd0', tone: 'light' },
    live: { href: 'https://www.articlenews.co', label: 'Read today’s edition', host: 'articlenews.co', embed: true },
    repo: { slug: 'article', url: gh('Article') },
    cta: { label: 'Read today’s edition', href: 'https://www.articlenews.co', note: 'Live at articlenews.co, with a new edition every morning.' },
    steps: [
      { title: 'Gathered from across the web, twice a day', text: 'A scheduled job pulls RSS feeds, removes duplicates and scores each story for quality.', phone: 'm_home', desktop: 'd_home' },
      { title: 'Rewritten in plain English', text: 'Every story becomes a plain title, what is happening, how it works and why it matters, with sources linked.', phone: 'm_story', desktop: 'd_story' },
      { title: 'In your inbox at 7 every morning', text: 'A daily digest, sent by two cron jobs. No one edits it by hand.', phone: 'm_story2', desktop: 'd_home' },
    ],
    metrics: [
      { value: '500+', label: 'stories published since the first edition on 14 June 2026', source: 'articlenews.co sitemap, 30 Sep 2026' },
      { value: '7', unit: 'am IST', label: 'when the day’s edition lands, every day since launch', source: 'The schedule' },
      { value: '50+', label: 'sources watched, filtered down to what actually matters', source: 'The README' },
      { value: '0', unit: 'editors', label: 'two scheduled jobs find, write and publish each edition', source: 'The README' },
    ],
    brief: [
      'AI news is written for people who already understand AI. Everyone else gets jargon, hype, or both, and the people most affected by the technology are the ones least served by the coverage.',
      'Article is a publication for them. It reads like a smart friend explaining the day, and it runs itself: gathering, rewriting, publishing and emailing without a human in the loop.',
    ],
    decisions: [
      { title: 'One shape for every story', text: 'Each story is rebuilt the same way: a plain title, a short summary, what’s happening, how it works and why it matters, with the original sources linked. A reader always knows where to look.' },
      { title: 'Rooms, not a feed', text: 'Stories are filed into rooms, The Big Story, Everyday AI, Explainer, At Work, Big Question and Just In, and every edition is kept in the Vault with a “What is AI?” primer for day one.' },
      { title: 'Quality before volume', text: 'The ingest job deduplicates by content hash and scores every story before it reaches the rewrite, so the pipeline publishes the day, not the noise.' },
      { title: 'Hands off, but guarded', text: 'Two GitHub Actions run the whole thing. The newsletter endpoint only answers a shared secret, and nothing is committed that shouldn’t be.' },
    ],
    flow: [
      { title: 'RSS feeds', text: 'More than fifty sources, pulled at 07:00 and 19:00 UTC.' },
      { title: 'ingest.ts', text: 'Deduplicate, rewrite with an LLM through OpenRouter, categorise and score.' },
      { title: 'Supabase', text: 'Articles and subscribers, read straight by the site.' },
      { title: 'articlenews.co', text: 'Next.js App Router: rooms, the Vault, RSS, Open Graph images and a sitemap.' },
      { title: 'The digest', text: 'Rendered with React Email and sent through Resend at 07:00 IST.' },
    ],
    outcome: 'Live at articlenews.co, publishing twice a day with more than 500 stories in the Vault and a newsletter that has not needed a human since launch.',
    shots: [
      { src: tex('article', 'd_home'), kind: 'desktop', alt: 'articlenews.co: what’s actually happening in AI, explained like a smart friend would.' },
      { src: tex('article', 'd_story'), kind: 'desktop', alt: 'A story, rebuilt in plain English.' },
      { src: tex('article', 'm_home'), kind: 'phone', alt: 'Today’s edition on a phone.' },
      { src: tex('article', 'm_story'), kind: 'phone', alt: 'A story on a phone.' },
      { src: tex('article', 'm_story2'), kind: 'phone', alt: 'How it works and why it matters.' },
    ],
  },
  {
    slug: 'power-policy',
    name: 'Power & Policy',
    category: 'web',
    phase: 'full',
    statusNote: 'Live, a briefing every day',
    context: { kind: 'cofounder', label: 'Co-founded, team of two' },
    line: 'The world economy and the balance of power, briefed daily.',
    summary:
      'A daily briefing on the global economy and geopolitics for curious people. I co-founded it and built all of it as the only developer: the site, the publishing system, the newsletter and a globe that shows where the news is happening.',
    kind: 'Publication',
    stack: ['Next.js', 'Canvas', 'Vercel', 'Email newsletter'],
    year: '2026',
    timeline: 'June 2026 to now',
    role: ['Co-founder', 'Product design', 'Full-stack engineering', 'The globe', 'Newsletter'],
    image: { base: '/work/power-policy', alt: 'Power & Policy on desktop and phone: today’s briefing beside a globe with the countries in the news lit.' },
    stage: { bg: '#d9e2d3', glow: '#f1f4ec', tone: 'light' },
    live: { href: 'https://www.powerpolicy.in', label: 'Read today’s briefing', host: 'powerpolicy.in' },
    cta: { label: 'Read today’s briefing', href: 'https://www.powerpolicy.in', note: 'Live at powerpolicy.in, with a new briefing every day.' },
    steps: [
      { title: 'Today’s briefing, beside a globe you can turn', text: 'The countries in the day’s news are lit. Drag the globe round and click one to read what is happening there.', phone: 'm_home', desktop: 'd_home' },
      { title: 'Five stories, each with the number that matters', text: 'Every briefing is five stories, tagged by theme, with one figure beside each: 4%, 100 basis points, the highest since 2002.', phone: 'm_stories', desktop: 'd_stories' },
      { title: 'Threads that follow a story as it unfolds', text: 'Briefings on one story are strung into a timeline, from the first report to where things stand now.', phone: 'm_thread', desktop: 'd_thread' },
      { title: 'A glossary for the words the news assumes', text: 'Plain definitions of the terms that keep coming up, each tagged to its theme and linked to the stories that use it.', phone: 'm_glossary', desktop: 'd_glossary' },
    ],
    metrics: [
      { value: '74', label: 'daily briefings published since the first on 8 June 2026', source: 'powerpolicy.in archive, 30 Sep 2026' },
      { value: '17', label: 'threads that follow a story from one briefing to the next', source: 'powerpolicy.in' },
      { value: '5', unit: 'stories', label: 'in each briefing, every one with the figure that matters set beside it', source: 'powerpolicy.in' },
      { value: '1', unit: 'developer', label: 'on a team of two: I designed and built all of it', source: 'The team' },
    ],
    brief: [
      'News about the world economy and geopolitics is written for people who already follow it. Tariffs, bond yields and a strait most people have never heard of set prices everywhere, and the coverage assumes you know why.',
      'Power & Policy is a daily briefing for curious people who don’t. I co-founded it as a team of two and built all of it: the site, the publishing system, the newsletter, the globe, and the archive, glossary and threads that give each day its context.',
    ],
    decisions: [
      { title: 'The globe is the front page', text: 'The countries in today’s briefing are lit on a globe you can drag. Click one and its story opens in place, so the map is a way into the news, not decoration.' },
      { title: 'Every story carries its number', text: 'Each of the five stories sets one figure beside its headline, with what it measures and how it moved. You get the scale of a story before you read a word of it.' },
      { title: 'Threads, not just days', text: 'Briefings are tied into threads that follow one story over weeks. A thread reads as a timeline, with where things stand at the top.' },
      { title: 'Define the words once', text: 'The glossary explains the recurring terms in plain language and tags each one to a theme, so a briefing can say “chokepoint” without losing anyone.' },
    ],
    flow: [
      { title: 'The day’s briefing', text: 'Five stories on the global economy and geopolitics, each with a key figure and themes.' },
      { title: 'Publishing system', text: 'Built for a team of two: each briefing goes out as one dated edition, filed into its threads and themes.' },
      { title: 'powerpolicy.in', text: 'Next.js on Vercel: today’s edition, the archive, the glossary and the threads.' },
      { title: 'The globe', text: 'Drawn on a canvas. Countries in the day’s news are lit and open their story on click.' },
      { title: 'The newsletter', text: 'The day’s briefing, in subscribers’ inboxes before breakfast.' },
    ],
    outcome: 'Live at powerpolicy.in with a new briefing every day, threads that follow stories like the Hormuz oil risk across 25 briefings, and the newsletter in inboxes each morning.',
    shots: [
      { src: tex('power-policy', 'd_home'), kind: 'desktop', alt: 'Today’s briefing beside the globe.' },
      { src: tex('power-policy', 'd_globe'), kind: 'desktop', alt: 'A country on the globe, clicked: Iran, and the story behind it.' },
      { src: tex('power-policy', 'd_stories'), kind: 'desktop', alt: 'Five stories shaping the day, each with its key figure.' },
      { src: tex('power-policy', 'd_thread'), kind: 'desktop', alt: 'A thread: the Hormuz oil risk, as a timeline.' },
      { src: tex('power-policy', 'd_glossary'), kind: 'desktop', alt: 'The glossary, in plain language.' },
      { src: tex('power-policy', 'm_home'), kind: 'phone', alt: 'Today’s briefing on a phone.' },
      { src: tex('power-policy', 'm_stories'), kind: 'phone', alt: 'The day’s stories on a phone.' },
      { src: tex('power-policy', 'm_thread'), kind: 'phone', alt: 'A thread on a phone.' },
      { src: tex('power-policy', 'm_glossary'), kind: 'phone', alt: 'The glossary on a phone.' },
    ],
  },
  {
    slug: 'stocky',
    name: 'Stocky',
    category: 'web',
    phase: 'crescent',
    statusNote: 'In development',
    context: { kind: 'product', label: 'My own product' },
    line: 'Learn investing on the stock you care about.',
    summary:
      'Search any ticker and Stocky builds a lesson around it: the live chart, one concept explained with that company’s own numbers, a minigame and a quick challenge.',
    kind: 'Web app',
    stack: ['Next.js', 'Framer Motion', 'FastAPI', 'yfinance', 'Supabase'],
    year: '2026',
    timeline: 'Feb 2026 to now',
    role: ['Learning design', 'Game design', 'Full-stack engineering', 'Market data'],
    image: { base: '/work/stocky', alt: 'Stocky on desktop and phone: the dashboard, and a lesson on NVIDIA with its live chart.' },
    stage: { bg: '#dfeadf', glow: '#f6f4e6', tone: 'light' },
    repo: { slug: 'stocky', url: gh('stocky') },
    cta: { label: 'Read the source', href: gh('stocky'), note: 'Next.js front end, FastAPI back end, twenty lessons.' },
    steps: [
      { title: 'Search any ticker', text: 'The dashboard keeps your level, your streak and the course you are on. Type a symbol to start a lesson.', phone: 'm_dash', desktop: 'd_dash' },
      { title: 'The live chart of the stock you picked', text: 'Real prices from five days to all time, with RSI, MACD, the 50-day average and a sentiment score.', phone: 'm_chart', desktop: 'd_chart' },
      { title: 'One concept, in that company’s own numbers', text: 'A selector picks the lesson that fits the stock. NVIDIA gets short interest, with NVIDIA’s own 1.3% in the copy.', phone: 'm_concept', desktop: 'd_concept' },
      { title: 'A minigame, then a quick challenge', text: 'Twenty-plus games, like the Short Interest Radar. Then three questions to prove it stuck.', phone: 'm_game', desktop: 'd_game' },
    ],
    metrics: [
      { value: '20', unit: 'lessons', label: 'from what a ticker symbol is to how short interest works', source: 'The course' },
      { value: '20+', unit: 'minigames', label: 'each built to teach exactly one concept by doing it', source: 'The course' },
      { value: '4', unit: 'steps', label: 'in every lesson: a live chart, the idea, a game, then a challenge', source: 'The lesson model' },
    ],
    brief: [
      'Investing is taught with made-up companies and definitions you forget by Friday. People don’t care about a hypothetical widget maker; they care about the stock they just read about.',
      'Stocky makes every lesson about a real stock you chose, in real time. A volatile stock teaches beta, a dividend payer teaches yield, and each concept ends in a game you play with that company’s numbers.',
    ],
    decisions: [
      { title: 'The lesson picks itself', text: 'A smart selector reads the stock’s traits and chooses the most relevant of twenty concepts, so the lesson always has something real to say about the company in front of you.' },
      { title: 'Written, then personalised', text: 'Lessons come from a written curriculum, and live values such as a company’s short-interest percentage are injected into the copy. It works without any AI model at all.' },
      { title: 'A game for every idea', text: 'Each concept has its own minigame, from the Short Interest Radar to Beta Shadow and Yield Magnet, because a thing you did sticks better than a thing you read.' },
      { title: 'Cache by how fast things change', text: 'Prices are cached for five minutes, concepts for six hours and quizzes for a week, so the app feels live without hammering the data source.' },
    ],
    flow: [
      { title: 'Search a ticker', text: 'NVDA, AAPL, TSLA or anything else listed.' },
      { title: 'FastAPI', text: 'yfinance for price, history, fundamentals and short interest; RSI, MACD and sentiment.' },
      { title: 'Smart selector', text: 'Picks the lesson that fits this stock, and injects its numbers into the slides.' },
      { title: 'LearningFlow', text: 'Chart, concept, minigame, challenge, with progress at every step.' },
      { title: 'Supabase', text: 'Accounts, weekly streaks, lesson rotation and feedback.' },
    ],
    outcome: 'In active development: live data, twenty lessons, a minigame for each and a dashboard with streaks all work. Public deployment is next.',
    shots: [
      { src: tex('stocky', 'd_dash'), kind: 'desktop', alt: 'The Stocky dashboard: level, streak and course.' },
      { src: tex('stocky', 'd_chart'), kind: 'desktop', alt: 'NVIDIA’s live chart with its indicators.' },
      { src: tex('stocky', 'd_concept'), kind: 'desktop', alt: 'Short interest, explained with NVIDIA’s own numbers.' },
      { src: tex('stocky', 'd_game'), kind: 'desktop', alt: 'The Short Interest Radar minigame.' },
      { src: tex('stocky', 'm_chart'), kind: 'phone', alt: 'The chart on a phone.' },
      { src: tex('stocky', 'm_concept'), kind: 'phone', alt: 'A concept slide on a phone.' },
      { src: tex('stocky', 'm_game'), kind: 'phone', alt: 'A minigame on a phone.' },
      { src: tex('stocky', 'm_quiz'), kind: 'phone', alt: 'The quick challenge.' },
    ],
  },

  // ---------------------------------------------------------------- E-commerce
  {
    slug: 'viraj-mahajan',
    name: 'Viraj Mahajan',
    category: 'commerce',
    phase: 'full',
    statusNote: 'Live store',
    context: { kind: 'client', label: 'Client project' },
    line: 'A storefront as considered as the clothes.',
    summary:
      'The online store for Viraj Mahajan, a Delhi label for luxury menswear. I designed and built it on Shopify, set up the whole back end and payments, and worked with the brand’s marketing team and photographers to launch it.',
    kind: 'Shopify store',
    stack: ['Shopify', 'Horizon theme', 'Liquid', 'Razorpay', 'Judge.me'],
    year: '2026',
    timeline: 'Freelance client',
    role: ['Store design', 'Shopify build', 'Payments and checkout', 'Conversion optimisation', 'Custom animations', 'Launch coordination'],
    image: { base: '/work/viraj-mahajan', alt: 'The Viraj Mahajan store: a close-up of linen in the hero, the Signature Linen collection and a product page with one-tap checkout.' },
    stage: { bg: '#17130f', glow: '#3d3127', tone: 'dark' },
    live: { href: 'https://virajmahajan.co', label: 'Visit the store', host: 'virajmahajan.co' },
    cta: { label: 'Visit the store', href: 'https://virajmahajan.co', note: 'Live at virajmahajan.co, taking orders across India.' },
    steps: [
      { title: 'A home page that dresses like the brand', text: 'Full-bleed studio photography, a serif wordmark and quiet navigation. The clothes do the talking.', phone: 'm_home', desktop: 'd_home' },
      { title: 'Collections you can actually shop', text: 'Signature Linen, kurtas and waistcoats, each filtered by fabric, size and price, all shot in one light.', phone: 'm_col', desktop: 'd_col' },
      { title: 'Buy in one tap, pay any way', text: 'Razorpay’s Buy Now sits beside Add to Cart: UPI, cards and cash on delivery, with free shipping said up front.', phone: 'm_product', desktop: 'd_product' },
      { title: 'On the free theme, taken further', text: 'Shopify’s Horizon, extended with custom sections, animations and apps for reviews and WhatsApp.', phone: 'm_cart', desktop: 'd_cart' },
    ],
    metrics: [
      { value: '164', label: 'size and colour variants across 8 pieces and 8 collections, live', source: 'virajmahajan.co, 30 Sep 2026' },
      { value: '₹0', label: 'spent on a theme: Shopify’s free Horizon, extended section by section', source: 'The build' },
      { value: '3', unit: 'teams', label: 'brought into one launch: the brand, marketing and photography', source: 'The project' },
    ],
    brief: [
      'Viraj Mahajan makes luxury menswear in India: linen and cotton shirts, kurtas and waistcoats with bespoke silhouettes and hand-finished details. The label had the clothes and the photography, but no store that felt as considered as either.',
      'I designed and built the store end to end: the look, the Shopify back end, payments and checkout, conversion details and custom motion, and I worked with the brand’s marketing team and photographers so the launch came together as one thing.',
    ],
    decisions: [
      { title: 'Extend the free theme, don’t buy one', text: 'I built on Horizon, Shopify’s own free theme, rather than a paid one, so the store keeps receiving Shopify’s updates. Custom sections and animations sit on top where the brand needed more.' },
      { title: 'Checkout the Indian way', text: 'Razorpay handles UPI, cards and cash on delivery, with a one-tap Buy Now beside Add to Cart. The payment options and free shipping are stated on the product page, before anyone has to ask.' },
      { title: 'Photography is the interface', text: 'I planned with the photographers and the marketing team how each shoot would be used: one backdrop and one light, so a collection reads as a set and nothing in the layout competes with the clothes.' },
      { title: 'Small things that sell', text: 'A first-order code in the announcement bar, Judge.me reviews on the home page, WhatsApp one tap away, and filters for fabric and size on every collection.' },
    ],
    flow: [
      { title: 'Brand, marketing and photography', text: 'Shoots planned around how they would live on the site.' },
      { title: 'Shopify and Horizon', text: 'Free theme, custom sections, motion and apps, wired into the brand’s catalogue.' },
      { title: 'Collections and products', text: 'Signature Linen, cotton, kurtas and waistcoats, filtered by fabric, size and price.' },
      { title: 'Razorpay checkout', text: 'One-tap Buy Now, UPI, cards and cash on delivery.' },
      { title: 'After the order', text: 'Reviews through Judge.me, questions through WhatsApp, free shipping across India.' },
    ],
    outcome: 'Live at virajmahajan.co, selling the full range across India with one-tap checkout, reviews and WhatsApp support in place.',
    shots: [
      { src: tex('viraj-mahajan', 'd_home'), kind: 'desktop', alt: 'The home page: Crafted for a Well Dressed Life.' },
      { src: tex('viraj-mahajan', 'd_col'), kind: 'desktop', alt: 'The Signature Linen collection.' },
      { src: tex('viraj-mahajan', 'd_product'), kind: 'desktop', alt: 'A product page with one-tap Razorpay checkout.' },
      { src: tex('viraj-mahajan', 'd_cart'), kind: 'desktop', alt: 'The cart drawer.' },
      { src: tex('viraj-mahajan', 'm_home'), kind: 'phone', alt: 'The home page on a phone.' },
      { src: tex('viraj-mahajan', 'm_col'), kind: 'phone', alt: 'Signature Linen on a phone.' },
      { src: tex('viraj-mahajan', 'm_product'), kind: 'phone', alt: 'The Chameleon Linen Shirt.' },
      { src: tex('viraj-mahajan', 'm_waist'), kind: 'phone', alt: 'Waistcoats on a phone.' },
      { src: tex('viraj-mahajan', 'm_cart'), kind: 'phone', alt: 'The cart on a phone.' },
    ],
  },
];

export const bySlug = (slug: string) => projects.find((p) => p.slug === slug)!;
export const inCategory = (id: CategoryId) => projects.filter((p) => p.category === id);
export const categoryOf = (p: Project) => categories.find((c) => c.id === p.category)!;
/** The next project in reading order, looping back to the first. */
export const nextOf = (p: Project) => projects[(projects.indexOf(p) + 1) % projects.length];
