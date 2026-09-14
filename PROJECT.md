# Logistics App

## Tikslas

Parodyti realų kiekvieno reiso pelningumą.

## MVP

Vartotojas gali:

- sukurti reisą
- įvesti pajamas
- įvesti atstumą
- įvesti kuro sąnaudas
- įvesti tolls
- įvesti vairuotojo kaštus
- įvesti kitus kaštus
- pamatyti bendrus kaštus
- pamatyti profit
- profit margin
- profit/km

## Vėliau

- Excel import
- telematics
- GPS
- fuel prices
- route optimization
- AI recommendations

## Pirmas milestone

Tikslas dabar nėra „logistikos platforma". Tik šitas:

```
NEW TRIP

Revenue:        €2400
Distance:       1750 km
Fuel used:      510 L
Fuel price:     €1.42
Tolls:          €280
Driver cost:    €450
Other costs:    €75

        ↓

Total cost:     €1529
Profit:         €871
Margin:         36.3%
Profit/km:      €0.50

[ Save Trip ]
```

Paspaudus Save Trip → reisas atsiranda sąraše:

```
TRIPS

LT001    Vilnius → Hamburg    €871 profit
LT002    Kaunas → Rotterdam   €420 profit
LT003    Vilnius → Warsaw     -€70 loss
```

Kai šitas veikia — turim pirmą produkto versiją.

## Skaičiavimai

Pilnas modelis — [docs/skaiciavimo-modelis.md](docs/skaiciavimo-modelis.md).
Jis paremtas realiu įmonės skaičiavimu (Omniva) ir yra specifikacija #3, #5–#9.
**Prieš rašant skaičiavimus, skaityti tą failą.**

Trumpai:

```
reiso_kaštai = keliai + kuras + adblue + (furos_paros_kaina × dienos)
pelnas       = pajamos - reiso_kaštai
marža        = pelnas / pajamos * 100        (tik kai pajamos > 0)
savikaina    = reiso_kaštai / apmokami_km    (tik kai apmokami_km > 0)
pelnas_km    = pelnas / apmokami_km          (tik kai apmokami_km > 0)
```

Esmė: fura kainuoja pinigus kiekvieną parą, net stovėdama. Todėl kaštai
skaičiuojami nuo paros savikainos, o ne nuo atskirų išlaidų sąrašo.

Pinigų sumos laikomos centais (integer), kad nebūtų float klaidų. Įkainiai —
dešimtainiai, 4 skaitmenys po kablelio. Rodoma eurais.

## Stack

Next.js + Supabase/PostgreSQL + Vercel. Detalės — README.md.

## Scope taisyklė

Viskas, ko nėra MVP sąraše, yra „Vėliau". Nedarom iš anksto.
