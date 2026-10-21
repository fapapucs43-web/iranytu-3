/**
 * Mega Batch, commit 2 — the education library.
 *
 * Fifteen Hungarian articles the reader can open from the Eszköztár: what
 * CBT is, how sleep and mood pull on each other, what grief actually does.
 *
 * TWO RULES THE TEXT ITSELF HAS TO KEEP
 *
 * 1. NON-CLINICAL. This app explains, it does not assess. Nothing here names
 *    a diagnosis, a medication, or a treatment, because a journal cannot do
 *    any of those and a reader who takes advice from a prose block deserves
 *    worse than silence. The single exception is the crisis article, whose
 *    whole job is to name a helpline and a professional — without those two
 *    it would withhold the most useful sentence in the library. The rule
 *    itself lives in `articleBlocklist.ts`, so this file's exception note and
 *    that module's list cannot drift apart.
 *
 * 2. TEGEZŐDVE. The reader is a peer, not a clinician. That is the register
 *    the rest of the app already speaks, and mixing registers inside one
 *    screen is worse than either on its own. The rule lives in
 *    `tegezoRule.ts`; this file only has to obey it.
 *
 * The read-marker is a SIDECAR, not a field on the main blob, for the reason
 * every other sidecar here is one: an export must carry what the user wrote,
 * never what the app did with it. Reads are stateless (localStorage on every
 * call) and a corrupt blob is an empty one — the worst case is that a
 * finished article looks unread, which costs one tap.
 */

export interface EducationArticle {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly takeaway: string;
  readonly action: string;
}

export const ARTICLES: readonly EducationArticle[] = [
  {
    id: "ed-cbt-alapok",
    category: "CBT alapok",
    title: "Mit tesz a gondolatnapló?",
    paragraphs: [
      "A kognitív viselkedésterápia egyik alapgondolata, hogy nem maga a helyzet nyom le, hanem az, amit róla gondolsz. Két ember ugyanazt a vasárnapot élheti át, és az egyik szép emlékként, a másik kudarcként viszi tovább.",
      "A gondolatnapló ezért nem napló a szó szokásos értelmében. Feljegyzed a helyzetet, az automatikus gondolatot, amit kiváltott, és az érzést, ami utánna jött. Nem kell szépen fogalmazni, elég pontosan.",
      "Amikor egy gondolat le van írva, kérdezni lehet rá: min alapul, és mit mondana erre valaki, aki szeret téged? Nem a gondolat kinevetése a cél, hanem egy kicsit tágabb nézőpont.",
    ],
    takeaway: "Nem a helyzet, hanem az értelmezés mozgatja a legjobban az érzéseidet.",
    action: "Ma este írj le egy nehéz helyzetet három sorban: helyzet, gondolat, érzés.",
  },
  {
    id: "ed-szorongas",
    category: "Szorongás",
    title: "Amikor a test riaszt, bármi nincs",
    paragraphs: [
      "A szorongás a tested riasztórendszere, és ez a rendszer nem tudja, hogy a holnap még nem történt meg. Ugyanaz a berendezkedés dolgozik, ami vészt észlelne, csak most egy jövőbeli képre figyel.",
      "Ezért olyan testi a szorongás: szívdobogás, szoruló mellkas, keringő gondolatok. Ezek nem arról szólnak, hogy elromlottál, hanem arról, hogy a riasztórendszer túlműködik. A túlműködő rendszer megnyugtatható.",
      "A leghosszabb kilégzés az első eszköz, mert a kilégzés kapcsolja be a nyugalmi üzemmódot. Lélegezz be négyig, fújd ki hatig, háromszor. Nem varázslat, de a test elkezd lejjebb lépni.",
    ],
    takeaway: "A szorongás testi riasztás, amit lehet csillapítani, nem ítélet, amit indokolni kell.",
    action: "Lélegezz be négyig, ki hatig, háromszor, és figyeld meg a mellkason a különbséget.",
  },
  {
    id: "ed-depresszio",
    category: "Depresszió",
    title: "A napok, amelyek egyformának látszanak",
    paragraphs: [
      "Van olyan időszak, amikor a napok összemosódnak. Ugyanaz a regény, ugyanaz a lámpa, ugyanaz a leképezés, és közben semmi sem érez többet súllyal. Ez önmagában nem jelent semmit, amit meg kellene magyaráznod.",
      "Ilyenkor a legkisebb döntések is nagyobb erőfeszítést igényelnek, mint kellene. Nem lustaság és nem jellemhiba, hanem a rendkívüli fáradtság, ami rány telepedik az apróbb dolgokra is.",
      "Ilyen napokon nem nagy tervekre érdemes célozni, hanem egyetlen apró, biztosan teljesíthető lépésre. Egy pohár víz, egy kimosott ruha, egyetlen bejegyzés. A lépés nem a cél, hanem a visszajutás.",
    ],
    takeaway: "Az apó lépések nem bagatellák, hanem az egyetlen biztos talaj ebben az időszakban.",
    action: "Válassz egy apró dolgot, ami öt percet vesz igénybe, és tedd meg ma.",
  },
  {
    id: "ed-alvas",
    category: "Alvás",
    title: "Az alvás nem lustaság, hanem szükséglet",
    paragraphs: [
      "Az alvás a nap hangszótere: reggel arra ébredsz, amit este hagytál bent. Bármit is forgat a fejed éjjel, az kikerül a tudatodból, és másnap reggel ott ébredsz, ahol az állításod végződött.",
      "A kevés alvás nemcsak fáradtságot okoz. Kevesebb önkontrollt és türelmet, több felnőtt aggodalmat — mindegyik olyan állapot, amit a nap második felében már nem bírsz szembenézni.",
      "Ha az alvás nem jön be, próbáld csökkenteni a figyelmet: egy könyv, nem a telefon; ugyanaz az idő, minden este. A rendszer a választhatóságra érzékeny, és a választhatóság tanítható.",
    ],
    takeaway: "Az alvás nem nyereség, amit meg kell érdemelned, hanem újratöltés.",
    action: "Ma este húsz perccel korábban tedd le a telefont, és írj le egy gondolatot papírra, ha kell.",
  },
  {
    id: "ed-taplalekozas",
    category: "Táplálkozás",
    title: "Amikor az evés átveszi a nap hangulatát",
    paragraphs: [
      "Az evés sokak számára a nap egyik legfontosobb hangszótere. Ha kimarad, később jön a kiskeresés: édes, gyors, és általában nem az, amire valóban szükséged volt.",
      "Az éhség és a jóllakottság nem ugyanaz. Az éhség szól, ha kell az energia, a jóllakottság a kellemetlenség elkerülése. Amikor ezek összekeverednek, a konyhában gyakran a második nyer.",
      "Egy-két napos figyelés sokat segít. Írd le, mikor éltél, mit, és hogyan voltál utána. Nem büntetés a napló, hanem tükör: a minta akkor válik láthatóvá, ha nem ítélkezik felette.",
    ],
    takeaway: "Az éhség, a sóvárgás és a jóllakottság három külön jel, és mindegyikre más válasz kell.",
    action: "Holnap egyik étkezés előtt kérdezd meg magadtól: éhezem, vagy csak kívánom?",
  },
  {
    id: "ed-mozgas",
    category: "Mozgás",
    title: "Mozgás akkor is, ha kedved nincs",
    paragraphs: [
      "A mozgás nem fogyasztás- és nem szépségprobléma. A testnek szüksége van rá, és a hangulatra is hat. Nem minden edzés egyforma, és nincs mindenre érvényes recept.",
      "Az akadály általában a kezdés. Tíz perc kiszállás nélkül már számít, és a legnehezebb lépés rendszerint az, hogy beugorj a szobába — nem maga a mozgás.",
      "Ha a kedved nincs, kezdd kicsivel, és olyannal, ami könnyű. Később, ha van kedved, bővíthető. A cél az, hogy a mozgás a nap természetes része legyen, nem egy külön feladat.",
    ],
    takeaway: "A mozdulás nem büntetés, és nem előfeltétele a jó hangulatnak — de gyakran megkönnyíti a napot.",
    action: "Állíts be egy tízperces emlékeztetőt, és mozogj annyit, amennyi belefér.",
  },
  {
    id: "ed-stressz",
    category: "Stressz",
    title: "A stressz nem ellenség",
    paragraphs: [
      "A stressz eredetileg védelmi rendszer: összpontosít, gyorsít, ébreszt. Ez nagyon hasznos, ha valóban van baj. Csak akkor fár, ha bekapcsol, és nem kapcsol ki.",
      "A tartós stresszben a test feszült, a figyelem szűk, és minden feladat fenyegetésként érkezik. Innen már nem ugyanaz a történet: nem arról szól, ami történik, hanem arról, hogy a test még mindig készen áll.",
      "A levezetés legegyszerűbb lépése a test megnyugtatása: séta, lassú kilégzés, meleg víz, kevesebb képernyő. Ezek nem a stressz megszüntetése, hanem a feszültség szintjének visszaállítása.",
    ],
    takeaway: "A stressz akkor nehezít, ha nem áll le magától — és a leállítás első lépése a test, nem a gondolat.",
    action: "Tölts tíz percet mozgás nélkül, csak lassú kilégzéssel, és figyeld meg a válladat.",
  },
  {
    id: "ed-kapcsolatok",
    category: "Kapcsolatok",
    title: "Amikor a másik ember beszél helyetted",
    paragraphs: [
      "Vannan helyzetek, ahol nem a saját szavaiddal reagálsz, hanem egy régebbivel. Megszólal benned egy szülő, egy korábbi barát vagy egy régi sézmény, és a mondat nem is hozzád szól.",
      "A leképezés nem ellenség. Olyan minta, amit valaki másnak a kedvéért alakított ki, és amit idővel átvett. Csak akkor szólal meg, ha a helyzet ugyanaz, és a hozzá tartozó érzés is.",
      "Ha érzed, hogy nem te beszélsz, próbálj meg lassítani, és egy pontos kérdést feltenni: most ezt érzed, vagy ezt? Gyakran a másik válasza hozza vissza a fonalat.",
    ],
    takeaway: "Ha a reakció túl nagy, túl gyors, vagy nem a tiéd, akkor egy régi minta szólal meg.",
    action: "Ma egyszer válaszolj lassabban: előbb egy kérdés, aztán a válasz.",
  },
  {
    id: "ed-munka",
    category: "Munka",
    title: "A munka és a pihenés határa",
    paragraphs: [
      "A munkanap végén a fej gyakran még dolgozik: tervez, rágódik, visszajátszik. A pihenés ilyenkor nem érkezik meg, mert a test megállt, de a figyelem még mindig bent van.",
      "A lezárás tudatos cselekvés: megírni, mit holnap csinálsz, és bezárni a napot. Ez kicsi dolog, mégis kivonja a feladatot a fejből, és nem marad bent éjjelre.",
      "Érdemes határhoz kötni a munkát, mert a szabad idő így marad szabad idő. A határ nem merev, de látható: elmondod, mikor ér véget.",
    ],
    takeaway: "A munka akkor nem mérgezi a napodat, ha van egy pontos pont, ahol véget ér.",
    action: "Írj le három sort arról, holnap mi a legfontosabb, és zárd le a napot.",
  },
  {
    id: "ed-gyasz",
    category: "Gyász",
    title: "A veszteség, aminek nincs határideje",
    paragraphs: [
      "A veszteség nem mindig nagy és látványos. Egy szokás, egy szerep, egy tervezett jövő hiányzik, és a hiány néha csak hosszú idő múlva érződik igazán.",
      "A gyászban nincs ütemterv, és senki nem tudja megmondani, mikor „kell” végezni. Gyakran döntésekkel kell szembenézni, amikor még semmi értelmet nem érzel — ez az egyik legnehezebb része.",
      "Ami segít: a hiány nevét kimondani, és nem a lezárásra sietni. Néha a gyászról egyszerűen beszélni valakivel — ennyi.",
    ],
    takeaway: "A gyász nem hiba, és nincs ütemterve; a sietség csak elrejti.",
    action: "Írd le egy mondatban, mi hiányzik — és ne próbáld meg ma megoldani.",
  },
  {
    id: "ed-duh",
    category: "Düh",
    title: "A düh, mint túl nagy jelzés",
    paragraphs: [
      "A düh sokszor nem a felhő, hanem a vihar előtti levegő. Jelzi, hogy valami fontos sérült: egy határ, egy ígéret, a saját időd.",
      "Amikor nagyon feszül a test, a szavak általában nem elég finomak. A düh ilyenkor a testen fut le: váll, állkapocs, gyomor. Ezt érdemes észrevenni, mert ott még van választás.",
      "Ha megvan a testi jel, ott még lehet választani: lassabb beszéd, egy pohár víz, öt perc szünet. Nem kell megbocsátani mindent, és nem kell elnyomni a dühöt — elég, hogy ne a másikon landoljon.",
    ],
    takeaway: "A düh nem ellenség, hanem túl erős jel; a testben már ott van, és ott még lehet választani.",
    action: "Ma egyszer, amikor feszül a gyomrod, lépj öt percet hátra, mielőtt válaszolnál.",
  },
  {
    id: "ed-onertekeles",
    category: "Önértékelés",
    title: "Mikor az önértékelés összehúzódik",
    paragraphs: [
      "Az önértékelés gyakran nem egyetlen szám, hanem egy hang: elég jó vagy nem elég jó. A hang gyors és általában nem mér, mégis úgy fogadják, mintha mérne.",
      "Érdemes megkérdezni, ki mondta ezt korábban, és milyen alkalomra szólt. Egy szülő vagy egy tanár sokszor egy konkrét helyzetre mondott véleményt, nem általában rád.",
      "Az összehúzódás idején nem újabb mérőszámot érdemes keresni, hanem egy konkrét, ellenőrizhető dolgot csinálni. A munka adja vissza a bizalmat, amit az önértékelés elvesztett.",
    ],
    takeaway: "Az önértékelés hangja nem mérőszám; ellenőrizhető munka adja vissza a bizalmat.",
    action: "Írd le egy konkrét dolgot, amit ma befejeztél, bármilyen apró volt.",
  },
  {
    id: "ed-onegyutterzes",
    category: "Önegyüttérzés",
    title: "Ha a sajnálat felülír mindent",
    paragraphs: [
      "Az együttérzés a másik helyzetébe állás. Hasznos, de van egy határ, ahol átcsap sajnálatba, majd onnan másik érzésbe: visszavonulásba, bűntudatba vagy épp szükségtelen aggodalomba.",
      "Aki sokat sajnál, az gyakran elfárad, és a fáradt ember már nem tud jelen lenni. Ezért az együttérzéshez időnként pihenés is kell, nem csak jelenlét.",
      "Kísérld ki a másik helyét megérteni, de ne add át a szenvedését. Egy mondat — ez nagyon nehéz, és semmi baj, ha most csak itt ülsz — többet segít, mint egy óra magyarázat.",
    ],
    takeaway: "Az együttérzés nem átvétel: ott lehetsz anélkül, hogy a másik terhét vinnéd.",
    action: "Ma egy beszélgetésben próbálj meg kérdést feltenni anélkül, hogy megoldást kínálnál.",
  },
  {
    id: "ed-mindfulness",
    category: "Mindfulness",
    title: "A figyelem visszahívása",
    paragraphs: [
      "A figyelmed hosszú időre elcsúszik: egy emlék, egy terv, egy aggodalom. Ez nem hiba, mindannyian ezt csináljuk. A gyakorlat nem az, hogy soha ne csússz el, hanem hogy észrevetted.",
      "Az egyetlen lépés, ami számít, a figyelem visszahívása — gondolat nélkül. Nem kell űzni a gondolatot; elég megjegyezni: itt vagyok, és visszatérni.",
      "Két perc is elég. Napi egy-két ilyen visszatérés többet ér, mint egy hosszú gyakorlat, amit egy-két nap után abbahagysz.",
    ],
    takeaway: "A mindfulness nem üres gondolat, hanem észrevétel és visszatérés.",
    action: "Állíts be egy napi kétszeri kétperces emlékeztetőt, és csak figyelj vissza.",
  },
  {
    // The ONE article allowed to name a professional: see articleBlocklist.ts,
    // which owns the exception list, so this note and that list cannot drift.
    id: "ed-krizis",
    category: "Krízis",
    title: "Amikor túl nagy a teher",
    paragraphs: [
      "Van olyan időszak, amikor a napok túl nehézzé válnak, és az ember úgy érzi, nincs kiút. Ez valós érzés, és nem kell hozzá szégyenkezni. Az első lépés ilyenkor gyakran az, hogy nem maradsz egyedül.",
      "Ha az érzés erős, és nem múlik el, akkor érdemes szakemberhez vagy egy segélyvonalhoz fordulni. Magyarországon a Magyar Lelki Elsősegély 116-123 éjjel-nappal hívható, életveszély esetén pedig a 112.",
      "Nem kell tudni, mit mondj, és nem kell elmagyaráznod az egész történetet. Elég, hogy felemeled a telefont, és bekapcsolsz. Ha az életed veszélyben van, a 112 az első szám.",
    ],
    takeaway: "Krízisben nem az erő, hanem az, hogy nem maradsz egyedül, számít.",
    action: "Mentsd el a 116-123 számot a telefonodba, és nézd meg, ki az a szakember, akinek most hívhatnál.",
  },
];

const READ_KEY = "belso-iranytu-education-read";

/** The ids the user has marked as read. Corrupt shape → empty, junk rows dropped. */
export function getReadArticleIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const ids = (parsed as { articleIds?: unknown }).articleIds;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function isArticleRead(id: string): boolean {
  return getReadArticleIds().includes(id);
}

/** Mark as read (deduplicated). Called from the reader's "Elolvastam" button. */
export function markArticleRead(id: string): void {
  if (!id) return;
  const merged = [...new Set([...getReadArticleIds(), id])];
  try {
    localStorage.setItem(READ_KEY, JSON.stringify({ articleIds: merged }));
  } catch {
    // storage full or unavailable — the article simply looks unread next time
  }
}

/** Clear the read markers; called from the settings' "delete everything" flow. */
export function resetReadArticles(): void {
  try {
    localStorage.removeItem(READ_KEY);
  } catch {
    /* noop */
  }
}

/** The articles grouped by category, in registry order — the library's index. */
export function articlesByCategory(): {
  category: string;
  articles: EducationArticle[];
}[] {
  const groups: { category: string; articles: EducationArticle[] }[] = [];
  for (const article of ARTICLES) {
    const last = groups[groups.length - 1];
    if (last && last.category === article.category) last.articles.push(article);
    else groups.push({ category: article.category, articles: [article] });
  }
  return groups;
}

/** The one article the reader is currently on, or undefined. */
export function findArticle(id: string): EducationArticle | undefined {
  return ARTICLES.find((a) => a.id === id);
}