# Krovinių pasiūlymų pavyzdžiai (Phase 0, 4 punktas)

Kiekvienas `NN.txt` – įklijuotas pasiūlymo tekstas, `NN.json` – ką iš jo turi užpildyti forma.

- `loading` / `unloading`: šalis (ISO2), pašto kodas, miestas – geokodavimui.
- `loadingDate`, `unloadingDate`: YYYY-MM-DD; `loadingTime` – lango pradžia, jei nurodyta.
- `priceCents` – kaina centais, `currency` – kaip parašyta tekste (ne eurai neperskaičiuojami).
- `weightKg`, `ldm`, `pallets` – tik jei yra tekste.
- `source`: "timocom", "transeu" arba "unknown" (tekste neparašyta).

**Svarbu:** 01–10 yra pavyzdžiai, surašyti pagal tipinį formatą, o ne nukopijuoti iš
Timocom ar Trans.eu. Tikras nukopijuotas tekstas gali atrodyti kitaip (lentelės, tabuliacijos,
vertimai), todėl 9 iš 10 tikslas tikrinamas su tikrais pavyzdžiais – juos dėti kaip 11.txt ir toliau.
