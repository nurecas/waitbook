/* Field cards: offline orientation for urgent situations.
   Rules (after Lastbook's): no doses, quantities or step-by-step procedures written by us; "first" holds only
   widely agreed first actions; "flags" are warning signs that mean trained help is needed; every card names the
   sources its wording follows and points to the full guides in the library. Not reviewed by clinicians. */
(function (root) {
  'use strict';
  root.WB_CARDS = [
    { id: 'bleeding', icon: 'health', title: 'Heavy bleeding and wounds', summary: 'Someone is bleeding heavily or has a deep cut.',
      first: [
        'Call your local emergency number, or get the person to trained help, if you can.',
        'Press firmly and directly on the wound — with a clean cloth if you have one — and keep pressing.',
        'Protect your own hands from blood if you can (gloves or a plastic bag).',
      ],
      flags: [
        'Bleeding does not slow down with firm pressure.',
        'Blood spurts, or the wound is deep, large, or on the neck, chest or belly.',
        'The person turns pale, cold, confused or very sleepy.',
        'Bites from animals or wounds from dirty or rusty objects (risk of infection, tetanus and rabies).',
        'In the following days: spreading redness, swelling, pus, red streaks or fever.',
      ],
      open: [
        { item: 'ifrc-firstaid', note: 'Bleeding, wounds and shock' },
        { item: 'wikimed', search: ['bleeding', 'wound', 'tourniquet'] },
        { item: 'hesperian', note: 'Where There Is No Doctor — first aid chapter' },
      ],
      prepare: ['Take a first-aid course with your Red Cross or Red Crescent society.', 'Keep a first-aid kit with gloves, dressings and bandages.'],
      sources: ['IFRC International First Aid, Resuscitation and Education Guidelines (2020)', 'WHO–ICRC Basic Emergency Care (2018)'] },

    { id: 'burns', icon: 'energy', title: 'Burns', summary: 'Burns from fire, hot liquids, chemicals or electricity.',
      first: [
        'Stop the burning: move away from the source. For electrical burns, switch off the power before touching the person.',
        'Cool the burn under clean, cool running water as soon as possible — your first-aid guide says for how long.',
        'Remove rings, watches and tight clothing near the burn, unless they are stuck to the skin.',
        'Cover loosely with clean plastic film or a clean cloth that does not shed fibres.',
        'Do not put ice, butter, oil or toothpaste on a burn.',
      ],
      flags: [
        'Large burns, or burns on the face, hands, feet, genitals or over joints.',
        'Burns from electricity or chemicals.',
        'Trouble breathing, a hoarse voice, or burns after smoke in a closed space.',
        'Burns in babies, young children, older people or anyone very unwell.',
      ],
      open: [
        { item: 'ifrc-firstaid', note: 'Burns' },
        { item: 'wikimed', search: ['burn', 'scald', 'electrical injury'] },
        { item: 'hesperian', note: 'Where There Is No Doctor — burns' },
      ],
      prepare: ['Learn first aid in person.', 'Keep a clean plastic wrap or burn dressing in your kit.'],
      sources: ['IFRC International First Aid, Resuscitation and Education Guidelines (2020)', 'WHO burns fact sheet'] },

    { id: 'breathing', icon: 'health', title: 'Not breathing, choking or unconscious', summary: 'Someone has collapsed, stopped breathing normally or is choking.',
      first: [
        'Shout for help and call your local emergency number. Put the phone on speaker so the call-taker can guide you.',
        'If the person is not breathing normally, start chest compressions: push hard and fast in the centre of the chest, and keep going.',
        'If someone is choking and cannot speak, cough or breathe, use back blows and abdominal thrusts as taught in first aid (babies need a different method — see your guide).',
        'If the person is unconscious but breathing normally, turn them on their side and keep checking their breathing.',
      ],
      flags: ['This is always an emergency. Keep going until trained help takes over or the person starts breathing normally.'],
      open: [
        { item: 'ifrc-firstaid', note: 'Resuscitation, choking and the recovery position' },
        { item: 'wikimed', search: ['cardiopulmonary resuscitation', 'choking', 'recovery position'] },
      ],
      prepare: ['Learn CPR and choking first aid in person — a short course makes a real difference.', 'Find out where the nearest defibrillator (AED) is.'],
      sources: ['IFRC International First Aid, Resuscitation and Education Guidelines (2020)'] },

    { id: 'dehydration', icon: 'water', title: 'Diarrhoea, vomiting and dehydration', summary: 'Someone has diarrhoea or is vomiting and may be drying out.',
      first: [
        'Keep giving fluids, little and often: oral rehydration solution (ORS) if you have it; your guides explain what else can be used.',
        'Keep breastfeeding babies, and keep offering food when the person can eat.',
        'Wash hands with soap after using the toilet and before touching food or water.',
      ],
      flags: [
        'Very sleepy, difficult to wake, or unconscious.',
        'Not able to drink or breastfeed, or vomits everything.',
        'Sunken eyes, a very dry mouth, or little or no urine.',
        'Pinched skin goes back very slowly.',
        'Blood in the stool, high fever, or diarrhoea lasting two weeks or more.',
        'Babies, young children, older people and pregnant women become dangerously dehydrated faster.',
      ],
      open: [
        { item: 'hesperian', note: 'Where There Is No Doctor — diarrhoea and dehydration' },
        { item: 'wikimed', search: ['oral rehydration therapy', 'diarrhea', 'dehydration', 'cholera'] },
        { item: 'who-wash-notes', note: 'Hand-washing and safe water' },
        { item: 'msf-clinical', note: 'For health workers: diarrhoea and dehydration' },
      ],
      prepare: ['Keep ORS sachets in your kit.', 'Download WikiMed or MedlinePlus in your language.'],
      sources: ['WHO/UNICEF Integrated Management of Childhood Illness (danger signs)', 'Hesperian, New Where There Is No Doctor'] },

    { id: 'fever', icon: 'health', title: 'Fever and serious illness', summary: 'A high temperature or illness that might be serious.',
      first: [
        'Keep the person comfortable, give plenty of fluids, and watch them closely.',
        'Write down when it started and any rash, cough, pain or medicines taken — it helps health workers.',
      ],
      flags: [
        'Stiff neck, a rash that does not fade when pressed, severe headache, confusion or fits (seizures).',
        'Fast or difficult breathing, or chest pain.',
        'Very sleepy or hard to wake.',
        'Any fever in a baby under 2 months old.',
        'Fever in or after time in an area with malaria — it needs testing.',
        'Signs of dehydration (see the dehydration card).',
      ],
      open: [
        { item: 'wikimed', search: ['fever', 'malaria', 'sepsis', 'meningitis'] },
        { item: 'medlineplus', search: ['fever'] },
        { item: 'cdc-travel', note: 'Malaria and other risks by country' },
        { item: 'hesperian', note: 'Where There Is No Doctor — fever' },
      ],
      prepare: ['Keep a thermometer in your kit.', 'Know where the nearest clinic is and how to get there without a car.'],
      sources: ['WHO/UNICEF Integrated Management of Childhood Illness', 'WHO–ICRC Basic Emergency Care (2018)'] },

    { id: 'water', icon: 'water', title: 'No safe drinking water', summary: 'Tap water is off or may be contaminated.',
      first: [
        'Use bottled or stored water first if you have it.',
        'Treat water that may be unsafe before drinking it. Boiling is the most reliable method; chlorine, filters and sunlight can work in some situations — your guides explain how and their limits.',
        'Let cloudy water settle and strain it through a clean cloth before treating it.',
        'Store treated water in clean, covered containers; pour it out rather than dipping cups in.',
      ],
      flags: [
        'Floodwater, water near factories, farms or mines, and salty water: boiling and chlorine do not remove chemicals or salt.',
        'Many people around you with diarrhoea — tell health workers or the authorities.',
      ],
      open: [
        { item: 'who-wash-notes', note: 'Treating and storing water; cleaning wells' },
        { item: 'zimgit-water' },
        { item: 'cawst', note: 'Household water treatment fact sheets' },
        { item: 'msf-phe', note: 'Water supply in emergencies' },
      ],
      prepare: ['Store water for every person in your household.', 'Keep a way to treat water: a pot and fuel, chlorine tablets or a filter.'],
      sources: ['WHO/WEDC Technical notes on drinking-water, sanitation and hygiene in emergencies', 'CAWST household water treatment resources'] },

    { id: 'sanitation', icon: 'water', title: 'Toilets and hygiene', summary: 'Toilets or sewers are not working.',
      first: [
        'Wash hands with soap and water after the toilet and before preparing food; your guides cover alternatives when there is no soap.',
        'If toilets do not work, use a lined bucket with a lid, or a pit latrine dug well away from water sources — your guides show how far.',
        'Keep human waste away from wells, streams and food.',
      ],
      flags: ['Diarrhoea spreading in a household, shelter or camp.', 'Sewage reaching drinking water or flooding homes.'],
      open: [
        { item: 'who-wash-notes', note: 'Emergency latrines and hand-washing' },
        { item: 'msf-phe', note: 'Sanitation in camps' },
        { item: 'sphere', note: 'Water, sanitation and hygiene standards' },
        { item: 'appropedia', search: ['latrine', 'composting toilet'] },
      ],
      prepare: ['Keep soap, bin bags and a bucket with a lid.'],
      sources: ['WHO/WEDC Technical notes on drinking-water, sanitation and hygiene in emergencies', 'The Sphere Handbook (2018)'] },

    { id: 'power', icon: 'energy', title: 'Power cut', summary: 'The electricity is off, maybe for days.',
      first: [
        'Never run a generator, barbecue, charcoal stove or gas heater indoors or in a garage: carbon monoxide kills without warning.',
        'Keep fridge and freezer doors closed; your food-safety guide says what to keep and what to throw away.',
        'Unplug sensitive electronics so a power surge cannot damage them when power returns.',
        'Save phone battery: lower the screen brightness and turn on low-power or airplane mode when you do not need a signal.',
      ],
      flags: [
        'Headache, dizziness, sickness or confusion in several people in the same room — get everyone into fresh air at once.',
        'Someone depends on powered medical equipment or medicines kept cold — arrange backup power or another place to stay.',
      ],
      open: [
        { item: 'energypedia', search: ['solar home system', 'battery'] },
        { item: 'zimgit-food', note: 'Keeping food safe without a fridge' },
        { item: 'ready-gov', search: ['power outage', 'carbon monoxide'] },
      ],
      prepare: ['Keep a torch, spare batteries and a power bank charged.', 'Consider a small solar panel to charge phones and lights.'],
      sources: ['WHO and US CDC carbon monoxide guidance', 'Ready.gov power outages'] },

    { id: 'heat-cold', icon: 'shelter', title: 'Extreme heat or cold', summary: 'A heatwave, or cold without heating.',
      first: [
        'Heat: stay in shade or the coolest room, drink water regularly, and check on older people, babies and anyone ill.',
        'Cold: stay dry, cover head, hands and feet, use layers and blankets, and share warmth.',
      ],
      flags: [
        'Heat: confusion, fainting, hot skin, or a very high body temperature — cool the person down and get help (heatstroke).',
        'Cold: shivering that stops, confusion, slurred speech or great sleepiness (hypothermia).',
        'Cold: skin that turns white, grey or numb (frostbite).',
      ],
      open: [
        { item: 'wikimed', search: ['heat stroke', 'hypothermia', 'frostbite'] },
        { item: 'ifrc-key-messages', note: 'Heatwaves and cold waves' },
        { item: 'outdoors-se', search: ['hypothermia', 'heat'] },
      ],
      prepare: ['Know who nearby is most at risk and check on them.'],
      sources: ['WHO heat-health guidance', 'IFRC public awareness key messages (2018)'] },

    { id: 'disaster', icon: 'prepare', title: 'After a flood, storm or earthquake', summary: 'The danger has passed for now, but the area is damaged.',
      first: [
        'Check yourself and others for injuries, and move away from damaged buildings, fallen power lines and floodwater.',
        'Do not walk or drive through floodwater: it can hide holes, debris and live electricity.',
        'Send text messages instead of calling to keep lines free, and follow official instructions on the radio if you can.',
        'After an earthquake, expect aftershocks: drop, cover and hold on.',
      ],
      flags: [
        'You smell gas: leave the building and do not use switches, phones or flames inside.',
        'Walls are cracked or leaning: stay out.',
        'Injured people: see the bleeding, burns and breathing cards.',
      ],
      open: [
        { item: 'ifrc-key-messages', note: 'What to do after floods, storms and earthquakes' },
        { item: 'zimgit-post-disaster' },
        { item: 'ready-gov', search: ['flood', 'earthquake', 'hurricane'] },
        { item: 'sphere', note: 'Shelter and settlement standards' },
      ],
      prepare: ['Make a household plan and a grab bag.', 'Know your safe places and evacuation routes.'],
      sources: ['IFRC public awareness key messages (2018)', 'US FEMA Ready.gov'] },

    { id: 'contact', icon: 'comms', title: 'Staying in touch without a network', summary: 'Phone networks or internet are down.',
      first: [
        'Text instead of calling: short messages often get through when calls do not.',
        'Phones close to each other can still message with mesh apps such as Briar or BitChat, if they were installed beforehand.',
        'A battery or hand-crank radio can receive official broadcasts.',
        'Go to the meeting place you agreed with your family.',
      ],
      flags: ['If you are in danger, try your emergency number anyway — many phones can reach emergency services through any available network.'],
      open: [
        { item: 'briar-apk', note: 'Install on Android phones while online' },
        { item: 'ham-se', search: ['emergency communication', 'antenna'] },
      ],
      prepare: ['Agree a meeting place and a contact person outside your area.', 'Write important numbers on paper.', 'Install a mesh messaging app on family phones (see Apps).'],
      sources: ['IFRC public awareness key messages (2018)'] },

    { id: 'distress', icon: 'health', title: 'Shock, fear and grief', summary: 'Someone is overwhelmed after something terrible happened.',
      first: [
        'Make sure the person is safe and away from further danger.',
        'Listen without pressure; do not push anyone to talk about what happened.',
        'Help with basic needs: water, food, a place to rest, finding family.',
        'Connect them with people who can help: family, friends, community or health services.',
      ],
      flags: [
        'Talk of suicide or self-harm — stay with them and get help.',
        'Not able to look after themselves or their children.',
        'Very confused, or not responding at all.',
      ],
      open: [
        { item: 'who-pfa', note: 'Psychological first aid: guide for field workers' },
        { item: 'who-mhgap', note: 'For health workers' },
        { item: 'wikimed', search: ['psychological first aid', 'grief', 'post-traumatic stress disorder'] },
      ],
      prepare: ['Read the psychological first aid guide — it is short.'],
      sources: ['WHO, War Trauma Foundation and World Vision International: Psychological first aid — guide for field workers (2011)'] },
  ];
})(typeof self !== 'undefined' ? self : globalThis);
