# Skaičiavimo modelis

Šis dokumentas aprašo, kaip skaičiuojamas reiso pelningumas. Tai yra
specifikacija issues #3 ir #5–#9 — kas rašo skaičiavimus, skaito šitą failą.

## Iš kur šis modelis

Šaltinis: `Ikainio skaiciavimas Omniva projektas.xlsx` — realus įmonės
skaičiavimas (Omniva, maršrutas Klaipėda–Kaunas–Klaipėda, 4 furos / 5 vairuotojai).

Modelis buvo atkurtas iš Excel formulių ir perskaičiuotas nepriklausomai.
Visi aštuoni kontroliniai skaičiai sutapo, todėl juo galima remtis.

Svarbu: Excel'yje yra kelios klaidos. Jos aprašytos skyriuje
[Ko neperkeliam iš Excel](#ko-neperkeliam-iš-excel). **Nekopijuokit formulių
aklai** — kopijuokit tai, kas parašyta žemiau.

## Pagrindinė formulė

```
reiso_kaštai = keliai + kuras + adblue + (furos_paros_kaina × dienos)
```

Esminė mintis, kuri skiria šį modelį nuo naivaus skaičiavimo: **fura kainuoja
pinigus kiekvieną parą, net stovėdama.** Todėl kaštai skaičiuojami ne „kiek
išleidau šitam reisui", o „kiek kainuoja para × kiek parų reisas užtruko".

## 1. Furos paros kaina

Dešimties dedamųjų suma. Pavyzdys — vilkikas NNN 888:

| Dedamoji | EUR/parą |
|---|---:|
| Vidutinis nusidėvėjimas | 57 |
| Vidutinės palūkanos | 0 |
| Draudimas kasko | 4 |
| Civilinis draudimas | 8 |
| CMR + DCA + Sveikatos draudimas | 2 |
| Atlyginimas ir mokesčiai (vairuotojo) | 145 |
| Komandiruotpinigiai vidutiniai | 0 |
| Vidutinės remonto sąnaudos | 28 |
| Vadyba | 0 |
| Priekaba | 25 |
| **Viso paros kaina** | **269** |

Dalis dedamųjų įvedamos kaip **mėnesinės** ir dalinamos iš darbo dienų
skaičiaus per mėnesį (Excel'yje — 22). Pavyzdžiui priekaba: 550 / 22 = 25.

Dalikliui reikia atskiro lauko (`working_days_per_month`, numatytoji 22), nes
skirtingos įmonės skaičiuoja skirtingai.

## 2. Kuras ir AdBlue

```
kuras  = (viso_km × sąnaudos_l_100km / 100) × kuro_kaina_eur_l
adblue = (viso_km × adblue_l_100km / 100) × adblue_kaina_eur_l

viso_km = apmokami_km + tušti_km
```

Dėmesio: kuras skaičiuojamas nuo **viso** kilometražo, įskaitant tuščius.
Pavyzdys: (11 250 × 26 / 100) × 1,24 = 3 627 EUR.

## 3. Keliai

Kiekviena reiso atkarpa turi šalį ir toje šalyje nuvažiuotus km. Įkainis
imamas iš žinyno pagal šalį.

Įkainis būna dviejų rūšių:

- **už kilometrą** — dauginama iš toje šalyje nuvažiuotų km
- **fiksuotas** — vinjetė ar kitas mokestis, pridedamas kaip yra

Prie atkarpų pridedami atskiri mokesčiai: tiltai/vinjetės, keltai, tuneliai,
parkingas.

```
keliai = Σ(atkarpos) + tiltai + keltai + tuneliai + parkingas
```

## 4. Pajamos

Du būdai, vartotojas pasirenka vieną:

```
pagal km:       pajamos = apmokami_km × eur_km_įkainis
pagal frachtą:  pajamos = frachto_kaina
```

Tušti kilometrai **neapmokami** — jie degina kurą, bet pajamų neneša.

## 5. Rezultatai

```
pelnas      = pajamos − reiso_kaštai
marža       = pelnas / pajamos × 100        (tik kai pajamos > 0)
savikaina   = reiso_kaštai / apmokami_km    (tik kai apmokami_km > 0)
pelnas_km   = pelnas / apmokami_km          (tik kai apmokami_km > 0)
```

Savikaina ir pelnas už kilometrą dalinami iš **apmokamų** km, ne iš visų.
Taip įmonė mato, kiek uždirba nuo to kilometro, už kurį jai moka.

## Kontrolinis pavyzdys

Tai realus Omniva reisas. **Šie skaičiai turi tapti pirmuoju testu (#5–#9).**
Jei testas nustos praeiti, vadinasi kažkas sulaužė skaičiavimą.

Įvestis:

| Laukas | Reikšmė |
|---|---:|
| Apmokami km | 11 050 |
| Tušti km | 200 |
| Dienos | 22 |
| Kuro sąnaudos | 26 l/100km |
| Kuro kaina | 1,24 EUR/l |
| AdBlue sąnaudos | 2,4 l/100km |
| AdBlue kaina | 0,765 EUR/l |
| Atkarpa: Vokietija | 0,348 EUR/km × 0 km |
| Tiltai/Vinjetės | 360 EUR |
| Furos paros kaina | 269 EUR |
| EUR/km įkainis | 1,09 |

Laukiamas rezultatas:

| Rodiklis | Reikšmė |
|---|---:|
| Kuras | 3 627,00 EUR |
| AdBlue | 206,55 EUR |
| Keliai | 360,00 EUR |
| Furos kaštai (269 × 22) | 5 918,00 EUR |
| **Viso kaštų** | **10 111,55 EUR** |
| Pajamos (11 050 × 1,09) | 12 044,50 EUR |
| **Pelnas** | **1 932,95 EUR** |
| Marža | 16,05 % |
| Savikaina | 0,9151 EUR/km |

## Žinynai

Paruošti duomenys iš Excel lapo „Duomenys" — juos galima suversti į duomenų
bazę kaip pradinius (#2/#3).

### Šalių įkainiai

| Šalis | Įkainis | Rūšis |
|---|---:|---|
| Austrija | 0,5317 | už km |
| Belgija | 0,32 | už km |
| Švedija | 4,2 | fiksuotas |
| Norvegija | 0,09 | už km |
| Vokietija | 0,348 | už km |
| Olandija | 4,2 | fiksuotas |
| Ispanija | 0,2 | už km |
| Italija | 0,19 | už km |
| Danija | 0,07 | už km |
| Prancūzija | 0,32 | už km |
| Čekija | 0,22 | už km |
| Lenkija | 0,35 | už km |
| Liuksemburgas | 4,2 | fiksuotas |
| Nemokami | 0 | už km |

Rūšis nurodyta atskirai sąmoningai — žr. klaidą Nr. 5 žemiau.

### Priekabos

| Priekaba | EUR/mėn |
|---|---:|
| Įmonės | 300 |
| Krone trailer | 550 |
| Hansa trailer | 550 |
| – | 0 |

## Ko neperkeliam iš Excel

Penki dalykai, kuriuos radome tikrindami failą. Programoje jų kartoti nereikia.

**1. Kelių suma praleidžia dvi eilutes.** Excel formulė `E26` sudeda
`F17+F18+F19+F20+F22+F23+F24`, bet praleidžia `F21` (penktą šalies atkarpą) ir
`F25` (Parkingą). Šiandien abi lygios nuliui, todėl klaida nematoma. Užpildžius
penktą šalį ar parkingą, keliai būtų suskaičiuoti per mažai, o pelnas parodytas
per didelis — be jokio įspėjimo.

Programoje atkarpos ir mokesčiai sudedami ciklu, ne ranka surašytu sąrašu.
Tada praleisti eilutės neįmanoma.

**2. Pelnas grąžinamas kaip tekstas.** `=IF(OR(...), "0", D38-D37)` — kabutės
paverčia nulį tekstu. Sudedant kelis reisus tokios eilutės tyliai praleidžiamos.
Programoje nulis yra skaičius `0`, niekada `"0"`.

**3. Priekabos paieška niekur nenaudojama.** Excel ištraukia priekabos kainą į
`C34`, bet jokia formulė jos neskaito — į kaštus priekaba patenka per ranka
įrašytą 25 EUR/parą. Du šaltiniai tam pačiam skaičiui. Programoje priekabos
kaina yra viena — paros kainos dedamoji, paimta iš žinyno.

**4. „Tušti KM – Automatiškai" nėra automatiški.** Tai ranka įrašytas skaičius.
Kol kas tegul lieka įvedamas ranka, bet be klaidinančios etiketės.

**5. Taisyklė „jei įkainis < 1, tai už km".** Excel atskiria įkainio rūšį pagal
tai, ar skaičius mažesnis už vienetą. Veikia, bet jei kada nors kurios nors
šalies įkainis už km viršys 1 EUR, jis tyliai virs fiksuotu mokesčiu.
Programoje rūšis yra atskiras laukas, ne slenkstis.

## Pastaba dėl skaičių tikslumo

`AGENTS.md` sako laikyti pinigus centais (sveikaisiais skaičiais). Tai galioja
**sumoms** — pajamoms, kaštams, pelnui.

Bet įkainiai sveikais centais netelpa: Austrijos 0,5317 EUR/km yra 53,17 cento.
Todėl:

- **sumos** — sveiki centai (`integer`)
- **įkainiai ir sąnaudų normos** — dešimtainis skaičius, 4 skaitmenys po kablelio
  (duomenų bazėje `numeric(10,4)`)
- apvalinama **tik pačioje pabaigoje**, skaičiuojant galutinę sumą centais

Taip išvengiama ir centų klaidų, ir prarasto tikslumo įkainiuose.
