/**
 * The recovery code's wordlist: 1024 Hungarian words.
 *
 * WHY 1024 AND NOT 2048. Twelve words at 1024 give ten bits each, so a code
 * carries a round 120 bits, four of them the checksum — 116 bits of secret,
 * far past brute force. BIP39 uses 2048
 * for eleven bits because it encodes entropy AND a checksum into sixteen
 * languages that all had to agree; this is one language, one app, and a round
 * number is worth more here than a familiar one.
 *
 * WHY A LIST WE OWN RATHER THAN BIP39. BIP39 has no official Hungarian list.
 * The app is Hungarian and the person writing this code down is Hungarian, so
 * an English list would be a worse product for a cosmetic claim of
 * standardhood — and the standard buys nothing here, because a BIP39 mnemonic
 * is not what unlocks this: HKDF over the list's own output is. There is
 * deliberately no BIP39 wordlist anywhere in this repository to be confused
 * with it.
 *
 * THE WORDS ARE AUTHORED, NOT DERIVED. The obvious shortcut was to mine the
 * app's own strings, and it was measured before being rejected: the only large
 * Hungarian text in src/ is prose in comments and identifiers, so extraction
 * yielded "staged", "framewor" and "machiner" alongside real words. A wordlist
 * has to be picked by hand, or it is a wordlist of source code.
 *
 * WHAT THE TEST GUARDS, and why each one is load-bearing:
 *   - exactly 1024, because the bit packing assumes ten bits per word;
 *   - all lowercase letters, and 2-10 of them; short words are the point (`só`,
 *     `hó`, `ló` are real Hungarian and stay) and ten is the transcription
 *     ceiling, past which a hand-copied compound starts dropping vowels. These
 *     bounds are measured, not asserted: this file's first draft claimed 4-8
 *     letters while carrying 215 entries outside that window, and the test is
 *     what makes the claim true rather than hopeful;
 *   - UNIQUE AFTER ACCENT FOLDING, which is the one that matters most:
 *     `wordsToEntropy` folds accents so somebody can type `arany` for `arany`
 *     without hunting for the right key, and two words that fold together would
 *     make the code ambiguous. A duplicate that only differs by an accent is
 *     therefore a bug, not a cosmetic wart.
 */
export const BACKUP_WORDS: readonly string[] = [
  // animals
  "kutya", "macska", "lóhere", "tehén", "disznó", "juh", "kecske", "tyúk",
  "kakas", "kacsa", "liba", "galamb", "veréb", "fecske", "gólya", "sas",
  "héja", "sólyom", "bagoly", "holló", "szarka", "rigó", "cinke", "pinty",
  "ponty", "harcsa", "csuka", "angolna", "teknős", "béka", "kígyó", "gyík",
  "egér", "patkány", "nyúl", "mókus", "sün", "róka", "farkas", "medve",
  "szarvas", "őzike", "hiúz", "borz", "menyét", "vidra", "pele", "denevér",
  "oroszlán", "tigris", "elefánt", "zsiráf", "majom", "pingvin", "strucc", "papagáj",
  "hattyú", "gém", "kánya", "ölyv", "túzok", "fácán", "szúnyog", "méh",
  // plants
  "tölgy", "bükk", "fenyő", "luc", "nyír", "fűz", "juhar", "kőris",
  "szil", "cseresznye", "meggy", "szilva", "barack", "kajszi", "körte", "alma",
  "birs", "füge", "dió", "mogyoró", "gesztenye", "mandula", "szőlő", "rózsa",
  "tulipán", "nárcisz", "jácint", "liliom", "orgona", "ibolya", "pipacs", "búzavirág",
  "szegfű", "margaréta", "kamilla", "zsálya", "menta", "kakukkfű", "rozmaring", "bazsalikom",
  "kapor", "tárkony", "snidling", "torma", "fokhagyma", "hagyma", "póré", "retek",
  "cékla", "sárgarépa", "karalábé", "káposzta", "karfiol", "brokkoli", "spenót", "saláta",
  "uborka", "paradicsom", "paprika", "padlizsán", "cukkini", "tök", "burgonya", "borsó",
  // food
  "kenyér", "zsemle", "kifli", "kalács", "sütemény", "torta", "palacsinta", "fánk",
  "rétes", "pite", "keksz", "puszedli", "csokoládé", "cukorka", "fagylalt", "puding",
  "leves", "gulyás", "pörkölt", "halászlé", "bableves", "krémleves", "húsleves", "gyümölcs",
  "rizs", "tészta", "nokedli", "galuska", "köles", "gríz", "zab", "korpa",
  "sajt", "túró", "tejföl", "vaj", "tej", "joghurt", "kefir", "aludttej",
  "sonka", "kolbász", "szalonna", "hurka", "májas", "libamáj", "csirke", "pulyka",
  "cukor", "gyömbér", "bors", "fűszer", "ecet", "olaj", "zsír", "margarin",
  "méz", "lekvár", "dzsem", "befőtt", "savanyúság", "aszalvány", "müzli", "nugát",
  // body
  "fej", "arc", "szem", "fül", "orr", "száj", "szakáll", "nyak",
  "haj", "homlok", "szemöldök", "szempilla", "orca", "ajak", "fog", "nyelv",
  "torok", "váll", "kar", "könyök", "alkar", "kéz", "ujj", "köröm",
  "mell", "has", "hát", "derék", "csípő", "láb", "comb", "térd",
  "sípcsont", "boka", "talp", "sarokcsont", "bőr", "izom", "csont", "vér",
  "szív", "tüdő", "gyomor", "máj", "vese", "bél", "agyvelő", "ideg",
  "ütőér", "csontvelő", "porc", "ínszalag", "szalag", "mirigy", "csigolya", "borda",
  "koponya", "állkapocs", "kulcscsont", "lapocka", "medence", "ízület", "ínyszövet", "hajszál",
  // family and people
  "anya", "apa", "fiú", "lány", "testvér", "nagymama", "nagyapa", "unoka",
  "dédapa", "dédanya", "rokon", "sógor", "sógornő", "após", "anyós", "nász",
  "férj", "feleség", "vőlegény", "jegyes", "gyerek", "csecsemő", "baba", "ifjú",
  "öreg", "ember", "személy", "nép", "nemzet", "család", "házastárs", "társ",
  "barát", "ismerős", "szomszéd", "vendég", "idegen", "tanár", "diák", "orvos",
  "ápoló", "mérnök", "munkás", "gazda", "pék", "szakács", "pincér", "titkár",
  "zenész", "festő", "író", "költő", "színész", "táncos", "énekes", "rajzoló",
  "kereskedő", "utazó", "vezető", "tanonc", "inas", "mester", "segéd", "vállalkozó",
  // house
  "ház", "lakás", "szoba", "konyha", "fürdő", "előszoba", "kamra", "pince",
  "padlás", "garázs", "erkély", "terasz", "udvar", "kert", "kapu", "kerítés",
  "fal", "padló", "mennyezet", "ablak", "ajtó", "küszöb", "sarok", "lépcső",
  "asztal", "szék", "pad", "kanapé", "ágy", "polc", "szekrény", "fiók",
  "tükör", "lámpa", "falióra", "szőnyeg", "függöny", "párna", "takaró", "lepedő",
  "kulcs", "retesz", "kilincs", "csengő", "kapcsoló", "konnektor", "vezeték", "izzó",
  "kályha", "kandalló", "kazán", "csap", "kád", "zuhany", "vécé", "mosdó",
  "emesze", "fogas", "szeg", "polcszeg", "gardrób", "sarokpolc", "komód", "vitrin",
  // kitchen and tools
  "tányér", "tál", "csésze", "bögre", "pohár", "kancsó", "kanál", "villa",
  "kés", "fakanál", "merőkanál", "szűrő", "vágódeszka", "tepsi", "fazék", "lábas",
  "serpenyő", "bogrács", "sütő", "tűzhely", "hűtő", "mosogató", "szemetes", "seprű",
  "lapát", "vödör", "rongy", "szivacs", "kefe", "partvis", "szappan", "súroló",
  "kalapács", "csavarhúzó", "fogó", "fűrész", "véső", "fúró", "csiszoló", "reszelő",
  "mérőszalag", "vonalzó", "körző", "ecset", "nyújtófa", "festék", "lakk", "enyv",
  "drót", "kötél", "zsineg", "lánc", "horog", "szög", "tüske", "gombostű",
  "csavaranya", "alátét", "csipesz", "harapófogó", "gyalu", "talicska", "gereblye", "ásó",
  // clothing
  "ruha", "ing", "nadrág", "szoknya", "blúz", "pulóver", "kardigán", "kabát",
  "mellény", "zakó", "öltöny", "köpeny", "esernyő", "sapka", "kalap", "sál",
  "kesztyű", "zokni", "harisnya", "cipő", "csizma", "szandál", "papucs", "bakancs",
  "fűző", "csat", "gomb", "cipzár", "övcsat", "nyakkendő", "zsebkendő", "táska",
  "hátizsák", "bőrönd", "pénztárca", "erszény", "nyaklánc", "fülbevaló", "karkötő", "gyűrű",
  "medál", "hajcsat", "hajgumi", "vállfa", "hajszalag", "nadrágszíj", "melltartó", "alsónadrág",
  "vászon", "gyapjú", "selyem", "bársony", "csipke", "pamut", "nemez", "kötés",
  "sapkás", "kendő", "fátyol", "keszkenő", "kötény", "munkaruha", "egyenruha", "jelmez",
  // nature and weather
  "nap", "hold", "csillag", "égbolt", "felhő", "eső", "hóesés", "jég",
  "szél", "vihar", "villám", "dörgés", "köd", "pára", "harmat", "dér",
  "hőség", "fagy", "hideg", "meleg", "langyos", "hűvös", "száraz", "nedves",
  "szivárvány", "napfény", "holdfény", "hajnal", "alkony", "pirkadat", "szürkület", "est",
  "reggel", "délelőtt", "délután", "éjszaka", "éjfél", "árvíz", "aszály", "zápor",
  "levegő", "oxigén", "szellő", "huzat", "por", "pollen", "permet", "esőcsepp",
  "hópehely", "jégcsap", "zivatar", "napsütés", "felhőzet", "napsugár", "naplemente", "napkelte",
  "szellőcske", "viharfelhő", "mennybolt", "csillagpor", "holdtölte", "újhold", "csillagkép", "üstökös",
  // landscape and places
  "hegy", "domb", "völgy", "síkság", "mező", "rét", "legelő", "erdő",
  "liget", "berek", "bozót", "cserje", "tisztás", "ösvény", "dűlő", "utca",
  "tér", "köz", "park", "híd", "alagút", "vasút", "állomás", "kikötő",
  "folyó", "patak", "tócsa", "tenger", "óceán", "öböl", "sziget", "part",
  "mocsár", "láp", "ingovány", "szikla", "kőzet", "szirt", "barlang", "bánya",
  "homok", "kavics", "agyag", "talaj", "humusz", "réteg", "ásvány", "kristály",
  "város", "falu", "község", "kerület", "körzet", "telep", "major", "tanya",
  "templom", "iskola", "kórház", "bolt", "piac", "hivatal", "bank", "posta",
  // time
  "másodperc", "perc", "óra", "napirend", "hét", "hónap", "év", "évszak",
  "tavasz", "nyár", "ősz", "tél", "hétfő", "kedd", "szerda", "csütörtök",
  "péntek", "szombat", "vasárnap", "január", "február", "március", "április", "május",
  "június", "július", "augusztus", "szeptember", "október", "november", "december", "dátum",
  "idő", "kor", "korszak", "pillanat", "szakasz", "kezdet", "vég", "múlt",
  "jelen", "jövő", "tegnap", "holnap", "mindig", "soha", "gyakran", "ritkán",
  "néha", "azonnal", "később", "előbb", "utána", "előtte", "közben", "végül",
  "hamar", "lassan", "sietve", "örökké", "ideiglenes", "állandó", "rögtön", "huzamos",
  // numbers and quantity
  "egy", "kettő", "három", "négy", "ötös", "hatos", "nyolc", "kilenc",
  "tíz", "húsz", "harminc", "negyven", "ötven", "hatvan", "száz", "ezer",
  "millió", "fél", "negyed", "harmad", "sok", "kevés", "több", "kevesebb",
  "pár", "darab", "csomó", "halom", "rakás", "sorozat", "első", "második",
  "harmadik", "negyedik", "ötödik", "hatodik", "hetedik", "nyolcadik", "kilencedik", "tizedik",
  "mennyiség", "összeg", "eredmény", "mérték", "maradék", "többlet", "hiány", "páros",
  "páratlan", "egész", "tört", "részlet", "adag", "csoport", "halmaz", "sokaság",
  "kevesen", "sokan", "mindnyájan", "némely", "némelyik", "valamennyi", "egyetlen", "sokféle",
  // colours and shapes
  "piros", "kék", "zöld", "sárga", "fehér", "fekete", "barna", "szürke",
  "lila", "rózsaszín", "narancs", "bézs", "drapp", "ezüst", "arany", "bronz",
  "világos", "sötét", "halvány", "élénk", "fakó", "tarka", "pettyes", "csíkos",
  "körvonal", "négyzet", "téglalap", "háromszög", "ötszög", "hatszög", "gömböc", "kocka",
  "henger", "kúp", "gúla", "vonal", "pont", "folt", "sáv", "csík",
  "forma", "alak", "minta", "jel", "szín", "árnyalat", "fényesség", "sötétség",
  "kerek", "szögletes", "hosszú", "rövid", "széles", "keskeny", "mély", "sekély",
  "vastag", "vékony", "nagy", "kicsi", "óriási", "apró", "hatalmas", "parányi",
  // movement and action
  "megy", "jön", "fut", "sétál", "ugrik", "mászik", "úszik", "repül",
  "áll", "leül", "fekszik", "kel", "szalad", "lép", "ugrál", "táncol",
  "néz", "lát", "hall", "szagol", "ízlel", "tapint", "érez", "gondol",
  "beszél", "mond", "kérdez", "felel", "hív", "kiált", "suttog", "énekel",
  "rögzít", "olvas", "számol", "rajzol", "fest", "vés", "farag", "formál",
  "épít", "bont", "szerel", "javít", "cserél", "rendez", "takarít", "mos",
  "főz", "süt", "vág", "szeletel", "kever", "gyúr", "dagaszt", "tölt",
  "visz", "hoz", "átad", "vesz", "tart", "nyit", "kitár", "csuk",
  // feeling and character
  "öröm", "bánat", "harag", "félelem", "büszkeség", "szégyen", "irigység", "vágy",
  "remény", "kétség", "hit", "bizalom", "kétely", "nyugalom", "izgalom", "unalom",
  "szeretet", "gyűlölet", "közöny", "empátia", "tisztelet", "megvetés", "csodálat", "undor",
  "derű", "bátorság", "gyávaság", "őszinteség", "hazugság", "hűség", "hűtlenség", "jóindulat",
  "türelem", "sietség", "feszültség", "higgadtság", "hevesség", "szelídség", "keménység", "lágyság",
  "okosság", "ostobaság", "tudás", "emlékezet", "bölcsesség", "naivitás", "ravaszság", "egyenesség",
  "bátor", "félénk", "vidám", "szomorú", "mérges", "nyugodt", "izgatott", "közömbös",
  "kíváncsi", "óvatos", "vakmerő", "szerény", "büszke", "alázatos", "barátságos", "zárkózott",
  // objects and sundries
  "könyv", "füzet", "papír", "toll", "ceruza", "radír", "irat", "boríték",
  "bélyeg", "levél", "újság", "folyóirat", "plakát", "kép", "fénykép", "album",
  "térkép", "zászló", "jelvény", "érem", "kitüntetés", "oklevél", "igazolás", "jegyzet",
  "tábla", "kréta", "filctoll", "golyóstoll", "tintatartó", "pecsét", "irattár", "dosszié",
  "doboz", "kosár", "láda", "zsák", "üveg", "palack", "dobókocka", "golyó",
  "labda", "korong", "cél", "játékszer", "babaruha", "építőkocka", "kártya", "sakk",
  "gyertya", "gyufa", "öngyújtó", "zseblámpa", "elem", "zsinór", "töltő", "dugasz",
  "szám", "betű", "szó", "mondat", "levélpapír", "napló", "notesz", "naptár",
] as const;

/** The list's size, and therefore the code's width in bits. */
export const BACKUP_WORD_COUNT = BACKUP_WORDS.length;
