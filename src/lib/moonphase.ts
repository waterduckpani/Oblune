// Tonight's moon, from the mean synodic month. Accurate to within about a day, which is all a
// footer needs. Reference new moon: 2000-01-06 18:14 UTC.
const SYNODIC = 29.530588853;
const EPOCH = Date.UTC(2000, 0, 6, 18, 14);

export function moonTonight(date = new Date()) {
  const days = (date.getTime() - EPOCH) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const lit = (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
  const waxing = age < SYNODIC / 2;
  const pct = Math.round(lit * 100);
  const name =
    pct <= 2 ? 'a new moon' :
    pct >= 98 ? 'a full moon' :
    pct < 45 ? (waxing ? 'a waxing crescent' : 'a waning crescent') :
    pct <= 55 ? (waxing ? 'the first quarter' : 'the last quarter') :
    waxing ? 'a waxing gibbous' : 'a waning gibbous';
  return { lit, pct, waxing, name };
}
