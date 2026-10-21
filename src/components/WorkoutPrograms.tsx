/**
 * Edzésprogramok — hat kész program, tartalom és semmi más.
 *
 * MIÉRT STATIKUS TARTALOM, ÉS MIÉRT NEM "FUNKCIÓ"
 * A modul egyetlen logikája a nyitás-zárás, amit a `Collapsible` már tud. A
 * többi szöveg: hat program, gyakorlatokkal és táplálkozási tippekkel,
 * leírva egyszer, a forrásban, ahol egy reviewer elolvassa. Nincs state,
 * nincs tárolás, nincs hálózat, nincs új függőség — a napló nem coach, és
 * ez a modul nem is próbálkozik a szerepével: nem számít Progressz-összesítőt,
 * nem emlékeztet, nem mér. Amit tud, az az, hogy a naplózás szokása mellé
 * kész mozdulatsort ad, amit a user ma el kezdhet.
 *
 * A HAT PROGRAM
 * Kezdő (testsúlyos, otthonra), Haladó (edzőtermi, nagyobb terhelés),
 * Otthoni (eszköz nélküli), Edzőtermi (gépes), és a health audit két
 * kiegészítése: Mobilitás és regeneráció (terhelés nélküli körök) és Séta és
 * állóképesség (alapépítés járdán). Mindegyik mellé tartalmi tipp: mit egyél
 * aznap, és miért. A tippek általános életmód-javaslatok, nem orvosi
 * ajánlások — a sor végi disclaimer kimondja, ugyanazokkal a szavakkal,
 * amelyeket az app minden elemzése alá ír, és a programok FÖLÖTT áll egy
 * piros-zászló sor azoknak, akiknek le kell állniuk.
 *
 * A NÉGY EREDETI PROGRAM VÁLTOZATLAN
 * Az audit additív volt: a négy régi program napjai, adagjai és tippjei
 * ugyanazok (a helyesírási és tévhit-javításokon kívül), és a determinisztikus
 * ajánló szabálytáblája is csak ezeket a négy id-t ismeri — az új kettő soha
 * nem lesz „Ma ez ajánlott", mert az ajánlás megváltoztatása nem additív.
 *
 * MIÉRT ITT VAN A MEGJELENÉS
 * A Ma nézet Eszköztár tárja fel a többi eszközt (légzés, CBT, hála), és ez
 * ugyanoda kerül: egy koppintás, sosem az útban. A komponens bemenet nélkül
 * működik, mert nincs mining je, ami bemenet lehetne — a Card/Collapsible
 * viszont ugyanaz, amit a többi eszköz használ.
 */
import { Collapsible, CollapsibleCard } from "./ui/ui";
import ContentIcon from "./ContentIcon";
import { Dumbbell } from "../lib/icons";
import { useApp } from "../state/AppContext";
import { recommendProgram, daysSinceLastSport, restNudge, REST_NUDGE } from "../lib/sportTips";
import { todayISO } from "../lib/dates";
import { t } from "../lib/i18n";

/**
 * WHY THE PROGRAMS STAY BELOW INSTEAD OF MOVING TO `lib/i18n.ts`
 * These four programs are editorial content — names, day headings, exercises,
 * doses, nutrition tips — written once here where a reviewer reads them next to
 * each other, in the same relationship `lib/mood`'s labels and `lib/dates`' month
 * names have to their own modules. They are the same kind of thing, so they get
 * the same treatment, and the catalogue's toolbox block says so next to the keys
 * that ARE chrome. Only the strings this component owns are `t()` calls.
 */

/** One exercise: what to do, and how much. */
type Exercise = { name: string; dose: string };

/** One program: who it is for, what it is, and what to eat around it. */
type Program = {
  id: string;
  label: string;
  who: string;
  /** The block is shown only when the user opens this program. */
  days: { day: string; exercises: Exercise[] }[];
  nutrition: string[];
};

const PROGRAMS: Program[] = [
  {
    id: "kezdo",
    label: "Kezdő",
    who: "Ha most kezded, vagy hosszú szünet után térsz vissza. Testsúlyos, otthonra, heti háromnap.",
    days: [
      {
        day: "Hétfő — alsó test",
        exercises: [
          { name: "Guggolás saját súllyal", dose: "3 × 10" },
          { name: "Kitörés váltott lábbal", dose: "3 × 8/láb" },
          { name: "Borjúemelés lépcsőn", dose: "2 × 15" },
          { name: "Híd a hátadon", dose: "3 × 12" },
        ],
      },
      {
        day: "Szerda — felső test",
        exercises: [
          { name: "Fekvőtámasz (térdre helyezve is jó)", dose: "3 × 6–10" },
          { name: "Evezés gumiszalaggal vagy asztal alatt", dose: "3 × 10" },
          { name: "Vállból nyomás üveg vízzel", dose: "2 × 10" },
          { name: "Plank", dose: "3 × 20 másodperc" },
        ],
      },
      {
        day: "Péntek — egész test",
        exercises: [
          { name: "Guggolás", dose: "2 × 10" },
          { name: "Fekvőtámasz", dose: "2 × 6–10" },
          { name: "Sétálás gyors tempóban", dose: "20 perc" },
        ],
      },
    ],
    nutrition: [
      "Reggelire is kerüljön fehérje: tojás, túró vagy joghurt — a nap összmennyisége számít, nem a napszak.",
      "Igyál vizet edzés előtt is, nem csak után — a szomjúságot könnyű fáradtságnak hinni.",
      "Az első héten ne legyen semmi extra: a cél, hogy a három napot tényleg végigcsináld.",
    ],
  },
  {
    id: "otthoni",
    label: "Otthoni, eszköz nélkül",
    who: "Ha nincs felszerelésed és nincs időd eljönni-elmenni. Kis helyen is elvégezhető, heti négynap.",
    days: [
      {
        day: "Kör 1 — alsó test",
        exercises: [
          { name: "Bolgár guggolás székkel", dose: "3 × 10/láb" },
          { name: "Ugrás helyben vagy lépés helyben", dose: "3 × 30 másodperc" },
          { name: "Oldalsó kitörés", dose: "3 × 8/láb" },
        ],
      },
      {
        day: "Kör 2 — felső test és törzs",
        exercises: [
          { name: "Fekvőtámasz széken vagy falról", dose: "3 × 10" },
          { name: "Tricepsz merítés széken", dose: "3 × 10" },
          { name: "Oldalplank", dose: "2 × 20 másodperc/oldal" },
          { name: "Hollow hold", dose: "3 × 15 másodperc" },
        ],
      },
      {
        day: "Kör 3 — intervallum",
        exercises: [
          { name: "40 másodperc munka / 20 másodperc pihenő, 4 gyakorlat × 2 kör", dose: "12 perc" },
        ],
      },
    ],
    nutrition: [
      "Edzés után egy banán vagy egy szelet kenyér lekvárral: a szénhidrát pótlása nem luxus.",
      "Ha este edzel, a vacsora legyen inkább fehérje és zöldség — a nagyon nehéz vacsora később is elhúzhatja az elalvást.",
      "Hétvégén főzz előre egy adagot: a hét közepén ez dönti el, mit eszel.",
    ],
  },
  {
    id: "halado",
    label: "Haladó",
    who: "Ha már rendszeresen edzel és terhelést tudsz növelni. Otthonra vagy terembe, heti négynap, súlyzóval.",
    days: [
      {
        day: "Nap 1 — húzó (hát, bicepsz)",
        exercises: [
          { name: "Húzódzkodás gumiszalagos segítséggel", dose: "4 × 5–8" },
          { name: "Evezés súlyzóval vagy szalaggal", dose: "4 × 10" },
          { name: "Bicepsz hajlítás", dose: "3 × 12" },
          { name: "Plank", dose: "3 × 40 másodperc" },
        ],
      },
      {
        day: "Nap 2 — toló (mell, váll, tricepsz)",
        exercises: [
          { name: "Nyomás súlyzóval vagy gépen", dose: "4 × 8–12" },
          { name: "Vállból nyomás", dose: "4 × 8" },
          { name: "Dips széken vagy korláton", dose: "3 × 8–12" },
          { name: "Oldalemelés", dose: "3 × 15" },
        ],
      },
      {
        day: "Nap 3 — alsó test",
        exercises: [
          { name: "Guggolás súlyzóval vagy egy lábon", dose: "4 × 8–10" },
          { name: "Román felhúzás súlyzóval", dose: "4 × 10" },
          { name: "Borjúemelés", dose: "3 × 15" },
        ],
      },
      {
        day: "Nap 4 — hosszú, lassú",
        exercises: [{ name: "Séta, futás vagy kerékpár", dose: "40–60 perc, beszélgetni is tudj" }],
      },
    ],
    nutrition: [
      "Fehérje minden étkezésben: testsúly-kilogrammonként nagyjából 1,4–1,6 g a nap folyamán — ez az azonosítás alapja, nem célérték.",
      "A növekedés a pihenőn történik — két egymás utáni kemény nap után pihenj azonos izomcsoporttal.",
      "Ha két hét alatt nem nő a súly, előbb az alvást és az evést nézd meg — a legtöbb elakadás ott van.",
    ],
  },
  {
    id: "edzoterem",
    label: "Edzőtermi",
    who: "Ha gépek és súlyzók közt edzel. Heti háromnap, teljes test vagy felosztott.",
    days: [
      {
        day: "Nap 1 — felhúzás fókusz",
        exercises: [
          { name: "Felhúzás (deadlift)", dose: "4 × 5" },
          { name: "Gépes evezés", dose: "3 × 12" },
          { name: "Mellkasprés gépen", dose: "3 × 10" },
          { name: "Hasprés gépen vagy súlyzós plank", dose: "3 × 12" },
        ],
      },
      {
        day: "Nap 2 — guggolás fókusz",
        exercises: [
          { name: "Guggolás szabadon vagy Smith-gépen", dose: "4 × 6–8" },
          { name: "Lábtolás gépen", dose: "3 × 12" },
          { name: "Vádli gépen", dose: "3 × 15" },
          { name: "Kihúzás gépen (lat pulldown)", dose: "3 × 12" },
        ],
      },
      {
        day: "Nap 3 — toló fókusz",
        exercises: [
          { name: "Fekvenyomás vagy súlyzós fekvenyomás", dose: "4 × 8" },
          { name: "Vállprés gépen vagy súlyzóval", dose: "3 × 10" },
          { name: "Tricepsz letolás kábelnél", dose: "3 × 12" },
          { name: "Bicepsz hajlítás kábelnél", dose: "3 × 12" },
        ],
      },
    ],
    nutrition: [
      "Edzés előtt 1–2 órával egy könnyű szénhidrát: zabpehely, banán, kenyér.",
      "A teremben is vedd magaddal a vizet — a gépek között senki nem érzi magát szomjasnak, mégis az.",
      "A terhelésnövelés aranyszáma: ha a harmadik sorozatban is megy a 8, jöhet a következő súly.",
    ],
  },
  // The health audit's two additions. The first four programs all assume the
  // reader can train; these two answer the two questions those four left out —
  // what to do when the body needs a lighter week, and how to start when the
  // starting point is the pavement. Both are EDITORIAL, like the four above:
  // no state, no scoring, and the recommender never names them (its rule table
  // does not know their ids, so it keeps picking from the original four).
  {
    id: "mobilitas",
    label: "Mobilitás és regeneráció",
    who: "Ha a tested pihenőt kér, vagy egy napot ülve töltöttél. Terhelés nélküli, 10–15 perces körök, hetente háromszor.",
    days: [
      {
        day: "Csípő és hát",
        exercises: [
          { name: "Guggolás tartásban", dose: "2 × 30 másodperc" },
          { name: "Macska–tehén", dose: "2 × 10" },
          { name: "Csípőhajlító nyújtás térdelésben", dose: "2 × 30 másodperc/oldal" },
          { name: "Gyermekpóz", dose: "1 perc" },
        ],
      },
      {
        day: "Váll és nyak",
        exercises: [
          { name: "Vállkörzés", dose: "2 × 10 mindkét irányban" },
          { name: "Falnál karnyújtás", dose: "2 × 8" },
          { name: "Mellkasnyitás ajtófélfánál", dose: "2 × 30 másodperc" },
          { name: "Felső csapóizom nyújtás", dose: "2 × 20 másodperc/oldal" },
        ],
      },
      {
        day: "Könnyű átmozgatás",
        exercises: [
          { name: "Séta beszélgetős tempóban", dose: "20–30 perc" },
          { name: "Lassú nyújtás, ahogy esik", dose: "5 perc" },
        ],
      },
    ],
    nutrition: [
      "Pihenőnapon is igyál annyit, mint edzésnapon — a szomjúságot ilyenkor is könnyű későn észrevenni.",
      "Az alvás a legrövidebb regeneráció: felnőttként 7–9 óra a legtöbbünknek.",
      "Fehérje pihenőnapon is kell: a regeneráció nem a szünetben áll meg, csak lassabb.",
    ],
  },
  {
    id: "seta",
    label: "Séta és állóképesség",
    who: "Ha az alapot építed: napi séta, hetente egyszer hosszabb és egyszer tempósabb. Ízületkímélő kezdés, fokozatosan.",
    days: [
      {
        day: "Hétköznapi alap",
        exercises: [
          { name: "Séta beszélgetős tempóban", dose: "20–30 perc" },
        ],
      },
      {
        day: "Tempós kör",
        exercises: [
          { name: "Bemelegítés lassan", dose: "5 perc" },
          { name: "Tempós séta (még tudsz beszélni, de énekelni nem)", dose: "4 × 3 perc" },
          { name: "Könnyű séta a körök között", dose: "2 perc" },
          { name: "Levezetés és nyújtás", dose: "5 perc" },
        ],
      },
      {
        day: "Hosszú kör",
        exercises: [
          { name: "Séta kényelmes tempóban", dose: "45–60 perc" },
        ],
      },
    ],
    nutrition: [
      "Séta előtt nem kell külön enni: egy órán belüli mozgáshoz a szervezetnek van miből dolgoznia.",
      "Hőségben vigyél vizet, és a hosszú kört tedd hűvösebb napszakra.",
      "Kényelmes cipő többet számít, mint bármilyen felszerelés — a séta akkor marad szokás, ha nem fáj.",
    ],
  },
];

/**
 * The module as the Today toolbox draws it. One collapsible per program, so
 * opening one does not scroll the others out of view; the intro and the tips
 * are part of each program's own block.
 *
 * Batch 11, commit 5 — the deterministic recommender names ONE program ("Ma
 * ez ajánlott" badge) from the last seven days of recorded sport, and the
 * rest nudge appears as a single line when three or more days passed since
 * the last entry. Both are invitations; neither blocks, reminds, or scores.
 */
export default function WorkoutPrograms() {
  const { data } = useApp();
  const today = todayISO();
  const recommended = recommendProgram(
    PROGRAMS.map((p) => ({ id: p.id, label: p.label, days: p.days.length })),
    data.entries.map((e) => ({
      date: e.date,
      kind: e.trackerValues?.sport && e.trackerValues.sport.kind === "select"
        ? e.trackerValues.sport.value
        : null,
      minutes: null,
    })),
    today,
  );
  const sinceLast = daysSinceLastSport(data.entries, today);
  const nudge = restNudge(sinceLast);

  return (
    <CollapsibleCard
      id="tools-workouts"
      title={t("tools.workouts.title")}
      icon={<Dumbbell size="1.1em" />}
      summary={t("tools.workouts.intro")}
    >
      <p className="muted-note">{t("tools.workouts.intro")}</p>
      {nudge && (
        <p className="nutrition-tip muted-note">{REST_NUDGE}</p>
      )}
      {/* The red-flag line the audit asked for. It sits above the programs
          rather than in the disclaimer at the bottom, because the reader who
          needs it is the one who stopped reading at the first exercise list. */}
      <p className="muted-note">{t("tools.workouts.safetyNote")}</p>
      {PROGRAMS.map((program) => (
        <Collapsible
          key={program.id}
          title={`${t("tools.workouts.programTitle", {
            label: program.label,
            days: program.days.length,
          })}${program.id === recommended ? " " + t("tools.workouts.recommendedBadge") : ""}`}
          icon={<ContentIcon name="TrendingUp" />}
        >
          <p className="muted-note">{program.who}</p>
          {program.days.map((day) => (
            <div key={day.day} className="workout-day">
              <strong>{day.day}</strong>
              <ul className="workout-exercises">
                {day.exercises.map((ex) => (
                  <li key={ex.name}>
                    <span>{ex.name}</span>
                    <span className="workout-dose">{ex.dose}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <strong className="workout-nutrition-title">{t("tools.workouts.nutritionTitle")}</strong>
          <ul className="workout-nutrition">
            {program.nutrition.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </Collapsible>
      ))}
      <p className="disclaimer">{t("tools.workouts.disclaimer")}</p>
    </CollapsibleCard>
  );
}
