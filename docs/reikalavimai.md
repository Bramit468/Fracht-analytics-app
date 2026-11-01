# Ko reikia iš Mitrenos

Duomenys ir sprendimai, be kurių Bramit skaičiai lieka apytiksliai. Kodas jiems
jau paruoštas – trūksta tik informacijos. Kai punktas įvykdytas, pažymėkite `[x]`
ir parašykite datą.

Atnaujinta: 2026-11-01.

## Duomenys

- [ ] **Kiekvienos furos paros kaštai** (svarbiausia). Dabar visos 23 furos turi
  vienodą paros kainą – 262 €, t. y. nukopijuotą, o paros kaina yra didžiausia
  reiso kaštų dalis. Reikia iš buhalterijos (Excel) kiekvienai furai per metus ar
  mėnesį:
  - lizingas / nusidėvėjimas, palūkanos;
  - draudimai: KASKO, civilinis, CMR;
  - vairuotojų alga su mokesčiais, dienpinigiai;
  - remontas, administravimas (gali būti vienoda suma visoms);
  - priekabos nuoma.

  Telematikoje šių kaštų nėra – tai buhalterijos duomenys. Atsiuntus lentelę, jie
  suvedami visoms furoms iš karto (Furos → Kaštai).
- [ ] **Kur vedami tarptautinių furų užsakymai.** MJI 014, NHT 384, NHT 387,
  LOV 141, MLV 023 spalį važiavo 28–30 dienų, bet Telematikos užsakymuose turi tik
  3–6 reisus. Dėl to 33 000 € pastovių kaštų per mėnesį nepriskirta jokiam reisui.
- [ ] **Kaip šios furos moka Vokietijos Maut.** NHT 384 spalį vežė Vokietija ↔
  Švedija ↔ Ispanija, o Telematikoje – tik viena 124 € vinjetė. Jei Maut mokamas
  per Toll Collect ar kitą įrenginį su atskira sąskaita, jo faktas Bramit nematomas.
- [ ] **Keltų sutartinės kainos** – Įmonė → „Keltų kainos“ (Klaipėda–Karlshamn ir
  kiti, kuriais plaukiate). Be jų skaičiuoklė rašo „kelto kaina nežinoma“.
- [ ] **Furų EURO klasė ir ašių skaičius** – Furos (dabar 0 iš 23). Nuo jų
  priklauso kelių mokesčių prognozė.
- [ ] **Per Daniją važiuojate tiltais (Storebælt, Øresund) ar keltu?** PTV kelių
  mokesčius Danijoje prognozuoja gerokai didesnius, nei Telematikoje sumokėta.
- [ ] **Telematika.lt: ar galima gauti odometro ir GPS istoriją pagal laiką per API?**
  Su ja tušti km tarp užsakymų būtų tikslūs iki kilometro (dabar – paros tikslumu).

## Veiksmai svetainėje

- [ ] **Importas → „Atnaujinti iš Telematikos“** – seni reisai gaus tuščius km tarp
  užsakymų (#258). Po to pakartoti prognozės ir fakto palyginimą.
- [ ] **Dispečeriai kasdien skaičiuoja kainas Bramit** ir pažymi „Paėmėm /
  Nepaėmėm“ (Gate 0: 2 dispečeriai, 4 savaitės, 100 pasiūlymų). 2026-11-01
  žurnale – 0 pasiūlymų.

## Sprendimai

- [ ] **Infrastruktūra (Phase 0, 7):** Supabase Pro (~25 $/mėn., kasdienės
  atsarginės kopijos – dabar jų nėra visai), Vercel Pro (~20 $/mėn., Hobby draudžia
  komercinį naudojimą), PTV planas su didesniu dienos limitu (2026-10-31 limitas
  baigėsi). Mokėjimus atlieka savininkas.
- [ ] **Pokalbiai su 10 vežėjų (Phase 0, 8):** telematika, kuro kortelės, kur laiko
  užsakymus, kaip skaičiuoja Timocom kainas, kiek mokėtų.
