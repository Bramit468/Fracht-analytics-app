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

```
fuel_cost     = fuel_used_l * fuel_price_per_l
total_cost    = fuel_cost + tolls + driver_cost + other_costs
profit        = revenue - total_cost
margin        = profit / revenue * 100      (tik kai revenue > 0)
profit_per_km = profit / distance_km        (tik kai distance_km > 0)
```

Pinigai laikomi centais (integer), kad nebūtų float klaidų. Rodomi eurais.

## Stack

Next.js + Supabase/PostgreSQL + Vercel. Detalės — README.md.

## Scope taisyklė

Viskas, ko nėra MVP sąraše, yra „Vėliau". Nedarom iš anksto.
