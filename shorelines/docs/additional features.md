#Additional Features to be planned
## Event Information
### Idea
each event card (Haldi, Mahendi, etc...) become interactable popovers that give information about the even historical significance what happens during the event and so on
### example copy

Two lengths per event: a **full version** for the schedule page popover, and a **concise version** (one line + an image) for the home screen event cards. Aimed primarily at guests unfamiliar with Indian weddings — Indian guests get it as a bonus, not the target reader. The wedding ceremony gets a longer treatment than the other five since it's the least familiar to outside guests.

**Note:** the ritual list under "The Wedding Ceremony" is written from general Hindu wedding conventions. Odia customs may differ or add steps — have the couple or the priest sanity-check that section before it goes live, since it's the part a guest has no way to independently verify.

#### Engagement and Ring Exchange

Full version:
```md
💍 What it is
A ring exchange ceremony marking the formal start of the wedding celebrations — more Western in format than the other events, with the couple exchanging rings in front of family and friends.

👗 What to wear
Smart and festive rather than playful — think elegant Indian wear or cocktail-style outfits.

🎉 What to expect
A short formal moment (the ring exchange), followed by mingling and dinner.
```

Concise version:
```md
💍 Engagement — a ring exchange marking the start of the celebrations. Smart, festive attire.
(+ image)
```

#### Mehendi

Full version:
```md
🌼 What it is
A joyful, music-filled evening held a day or two before the wedding, traditionally hosted by the bride's family. She sits for intricate henna patterns on her hands and feet — a tradition believed to bring good luck, with the saying that the darker the stain, the stronger the marriage. Henna itself has been used for body art for thousands of years across South Asia, the Middle East, and Africa. Guests are welcome to get a small design done too.

👗 What to wear
This is the most colorful, playful event of the wedding — bright festive colors like mustard, coral, turquoise, and fuchsia all work well. A kurta set, Indo-western separates, or a lighter lehenga are all good options; anything you can sit on the floor and dance in comfortably. Lightweight fabrics (cotton, georgette, chanderi) hold up best if it's warm.

✋ A tip if you're getting henna
Wear sleeves you can roll up easily, and skip rings, bangles, and bracelets until the henna's dried — wet henna can stain jewelry and clothes.

🎉 What to expect
Music, choreographed dances, festive food, and a relaxed, social atmosphere — guests come and go throughout, so there's no strict schedule to follow.
```

Concise version:
```md
🌼 Mehendi — an evening of henna, music & dance. Wear bright, comfortable colors.
(+ image)
```

#### Haldi

Full version:
```md
🌼 What it is
Turmeric paste is applied to the bride and groom by family and friends — said to bless them with a glow and ward off bad luck before the wedding. It's playful, hands-on, and gets messy.

👗 What to wear
Yellow tones are traditional. Wear something you don't mind staining — this is not the day for your best outfit.

🎉 What to expect
Laughter, turmeric everywhere, and a relaxed, informal mood.
```

Concise version:
```md
🌼 Haldi — turmeric, music & laughter. Wear yellow, and something you don't mind staining.
(+ image)
```

#### Sangeet

Full version:
```md
🎶 What it is
A night of music and dance — family and friends perform choreographed numbers for the couple, followed by open dancing. Sangeet literally means "sung together."

👗 What to wear
Glamorous and dance-friendly — sequins, sharara sets, gowns, or Indo-western all work.

🎉 What to expect
Performances, a DJ, and dancing late into the night.
```

Concise version:
```md
🎶 Sangeet — a night of performances and dancing. Dress glamorous and dance-ready.
(+ image)
```

#### The Wedding Ceremony

Full version:
```md
🕉️ What it is
The main event — Shubham and Amruta will be married in a traditional Hindu ceremony conducted by a priest around a sacred fire (the agni), which stands as witness to the marriage. Hindu weddings are ritual-rich and can run several hours; seating is comfortable and guests are welcome to come and go.

⏰ Why the timing matters
The ceremony begins at the muhurat — an astrologically chosen auspicious moment — believed to bless the marriage with good fortune. Several of the most significant rituals happen right around this time, so it's worth being seated a little early.

🪔 Rituals to watch for
* Baraat — the groom's arrival, often with music and dancing, welcomed by the bride's family.
* Kanyadaan — the bride's father formally giving her hand in marriage.
* Saptapadi — the couple takes seven steps together around the sacred fire, each step a shared vow for married life; traditionally, this is the moment the marriage becomes complete.
* Sindoor & Mangalsutra — the groom marks the bride's hairline with vermilion and ties a sacred necklace around her neck, both traditional signs of a married Hindu woman.

👗 What to wear
Traditional Indian formalwear — sarees, lehengas, suits, or sherwanis in festive colors. Solid black or all-white are usually avoided at Hindu weddings, but otherwise there's no strict dress code.

🙏 A couple of etiquette notes
You may be asked to remove your shoes near the mandap (ceremony stage). Photography is welcome, but try not to block the professional photographer during key rituals near the fire.

🎉 What to expect
A long, ritual-filled, and meaningful ceremony, followed by celebration, food, and photos with the couple.
```

Concise version:
```md
🕉️ The Wedding — a traditional Hindu ceremony around a sacred fire. Traditional Indian formalwear; avoid solid black or all-white.
(+ image)
```

#### Reception

Full version:
```md
🥂 What it is
A formal dinner celebrating the newly married couple, introducing them to a wider circle of family, friends, and colleagues.

👗 What to wear
Formal eveningwear — elegant Indian formal or Western black-tie-adjacent.

🎉 What to expect
Dinner, speeches, photos with the couple, and dancing.
```

Concise version:
```md
🥂 Reception — a formal celebration dinner. Formal eveningwear.
(+ image)
```

### where can you access this information?
- in the schedule page each event card (in their details popovers)
- the event cards in the home screen again as popovers when clicked (these will be a more concise version)

### UI elements
- pnpm dlx shadcn@latest add https://cult-ui.com/r/expandable.json
- npx shadcn@latest add https://registry.watermelon.sh/r/expandable-event-card.json
- 


## places to visit near by
### Idea
for people comming from outside i would like to add places to visit near the venue for sight seeing.

### links

- Mahendragiri https://share.google/rWUtfLqvDFJbBpUSo
- https://maps.app.goo.gl/hzzkRp44RDZ3F3g78?g_st=aw
- https://maps.app.goo.gl/Xeemby5Lnh8aLfK29?g_st=aw
- https://odishatourism.gov.in/content/tourism/en/discover/attractions/temples-monuments/udaygiri-and-amp-khandagiri-caves-temple.html
- https://share.google/Ea5MH71O20fWqRLM0

### where can you access this information?
- the places to visit card inside the travel & stay section in the home screen when clicked will redirect you to a new page for places to visit
- another link will be present within the today section as a card and will redirect to the same page


## Today page updates
- the page has "your days with us" section that shows all events this is already visible in the schedule so cant we have "Places to visit and things to do" section in the schedule page instead and remove it from the today page? 
- and also there is a "View Schedule" button at the bottom of the today page that takes you to the schedule page but that seems redundant since the schedule page is already present in the bottom navigation bar right?
- also we can update the Getting there card to make it look similar to what we have on the home screen
- can we move "leave a message" to the top of the page below the countdown. use this UI element "pnpm dlx shadcn@latest add https://cult-ui.com/r/morph-surface.json"