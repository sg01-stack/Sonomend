# Sonomend demo

Run npm ci, npm run check, then npm run dev. Open the app over localhost or HTTPS. The landing DEMO button sits beside CALIBRATE.

1. Calibrate the horn while parked. DEMO opens calibration first if necessary and starts automatically after saving.
2. Allow microphone access. Demo uses a fixed simulated Bengaluru route and never requests GPS. The map starts moving automatically.
3. Watch the permanent marked-corner label and local junction. Play one calibrated horn sound while inside its marker around 44–49 seconds. No detected horn during a complete usable crossing gives one practice penalty. Two or more distinct horns within five seconds give one repeat penalty per burst.
4. The report opens at 60 seconds. Practice does not earn real daily rewards. The lower scripted-audio mode can rehearse deterministic outcomes without a microphone.
5. For real trips, a finished tracked day with zero penalties earns five points; every 100 total points unlocks a reward. Missing coverage cannot establish a clean day. The dashboard survives reload through saved IndexedDB trips.

The six glass capsules wiggle gently and reflect during model/view movement, then lose the megaphone reflection when still. Reduced motion suppresses movement. Real horn accuracy, Android performance and real-road validation remain outstanding. These are app game rules, not proof of ownership or a road-safety judgment. No public deployment or live hosted-provider inference is claimed.
