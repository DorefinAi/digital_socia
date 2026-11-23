# How a First India video post is built

What this is based on: 26 videos @1stIndiaNews posted on X on 21 Nov 2026 between 13:36 and 16:15 IST, with their captions, hashtags,
mentions, view counts, Whisper transcripts and frame contact sheets. 25 are cuts from the TV bulletin (1280x720). One is a vertical
digital short (ISRO). This file describes what the desk does. It is not a design. BACKEND-PLAN.md turns it into a plan.

---

## 1. The post, part by part

```
पेड़ पर लटका मिला युवक का शव, परिजनों को मारकर पेड़ पर लटकाने का संदेह | Kota News      <- headline | place suffix
                                                                                         <- one blank line
#RajasthanWithFirstIndia #FINVideo #Kota #RajasthanNews #KotaCrime #YouthBodyFound       <- brand, FINVideo, place, topics
@KotaPolice                                                                              <- mentions
[video attached]
```

| Part | Seen in the 26 posts |
|---|---|
| Headline | 50–128 characters, median 95. Hindi with names in English (17/26 have English words: *PM Modi*, *Nitish Kumar*, *SMS Hospital*, *STF*, *BRICS*). 4 end in `!`, 3 quote a speech in `'…'`. |
| Topic prefix | 4/26 start with `<Topic>:`: `Accident:`, `Bansur Cylinder Blast:` (x2, an ongoing story), `Panchayat Election Result:`. |
| Place suffix | `\| <City> News` on 17. `\| <City> \| Rajasthan News` on 3. `\| Rajasthan News` on 2. Other forms on 4 (`\| ISRO`, one with no suffix). |
| Caption length | 173–330 characters, median 244. **2 are over 280**, so the account can post long text (X Premium). |
| Hashtags | 3–13 per post, median 7. |
| Mentions | 0–4, usually 1. |
| Views | 1,314–2,748 in the first hours, median 2,032. |

---

## 2. Where the headline comes from

### 2.1 What is on the screen

Every TV cut has the same screen layout. The headline is built from the layers that change:

| Layer | Where | What it carries | Use |
|---|---|---|---|
| **Headline bar** | Red bar at the top | One line. It **rotates through 3–4 lines** about every 10 s. | Main source of the headline |
| **BREAKING box** | Large box on the right, two lines | A shorter version of a bar line (*मशहूर सिंगर सोनू निगम पहुंचे जयपुर एयरपोर्ट*) | A second source with the same facts |
| **Place slug** | Small yellow tag, top left of the video | `कोटा`, `हरियाणा`, `जयपुर से LIVE`, `वैशाली, बिहार से LIVE` | **The place suffix** |
| **Name strip** | Over the speaker | `PM नरेन्द्र मोदी` + `LIVE` | The person (hashtag, mention, English name in the headline) |
| **Reporter card** | Photo and name, or a full-screen "REPORTER LIVE" card | The reporter's name, `सीनियर स्पेशल रिपोर्टर` | The reporter mention |
| Studio anchor | The first seconds (*हमारा राजस्थान* set, anchor) | Nothing about the story | Skip |
| Footer | Bottom band, the same on every clip | TATA PLAY 1182, airtel 361, social handles | Ignore |
| Watermark | "First On 1st India" across the video | Nothing | Ignore |

The vertical digital short has none of these. It has the brand logo, the anchor's name card, and word captions (*साइकिल पर*).
Its headline is written from the story itself.

### 2.2 How the desk turns the screen into a headline

The contact sheets show four ways of doing it, from the simplest to the most rewritten:

**A. One bar line, as is.** The bar line plus the place. This is rare. Even short clips usually join two lines (B).

**B. Two bar lines joined with a comma.** This is the most common shape. The first part is the event and the second is the detail.

> Bar lines (Ajmer): *टांकावास गांव में युवक की निर्मम हत्या* · *पिता की बेइज्जती का बदला लेने के लिए हत्या* · *मुख्य आरोपी गिरफ्तार, एक बाल अपचारी निरुद्ध* · *पहले शराब पिलाई फिर पत्थर से हमला कर की हत्या*
> Posted: *टांकावास गांव में युवक की निर्मम हत्या, पिता की बेइज्जती का बदला लेने के लिए हत्या* `| Ajmer News`

> Bar lines (Kota): ① *पेड़ पर लटका मिला युवक का शव* ② *परिजनों को मारकर पेड़ पर लटकाने का संदेह* ③ *पेड़ पर लटकती लाश का हाथ फ्रैक्चर…* ④ *रामगंजमंडी पुलिस थाने के भूंडखेड़ी गांव का प्रकरण*
> Posted: **①, ②** `| Kota News`
>
> Bar lines (Haryana): *हिसार में STF और बदमाश के बीच मुठभेड़* · *बड़ोपट्टी टोल के पास बदमाश ने STF पर चलाई गोली* · *पुलिस की बुलेटप्रूफ जैकेट पर लगी गोली, बाल-बाल बचा जवान* · …
> Posted: *बड़ोपट्टी टोल के पास बदमाश ने STF पर चलाई गोली, बाल-बाल बचा जवान* `| Haryana News` (line 2 + the end of line 3)

**C. Place slug + name strip + bar line.** Used for big public events.

> Slug *वैशाली, बिहार से LIVE* · strip *PM नरेन्द्र मोदी* · bar *गंगा नदी पर बने 'नीतीश सेतु' का किया लोकार्पण*
> Posted: *बिहार के वैशाली पहुंचे PM Narendra Modi, गंगा नदी पर बने 'नीतीश सेतु' का किया लोकार्पण* `| Bihar News`

**D. A rewrite that merges several lines.** The words change, but every fact comes from a line on screen.

> Bar lines: *कांग्रेस अध्यक्ष खड़गे और राहुल गांधी आएंगे Training में* · *जयपुर या कुंभलगढ़ में हो सकती सचिवों की यह Training*
> Posted: *राजस्थान आएंगे Rahul Gandhi और Kharge जयपुर या कुंभलगढ़ में AICC Training!* `| Rajasthan News`
>
> Bar lines: *मशहूर सिंगर सोनू निगम पहुंचे जयपुर एयरपोर्ट* · *जयपुर एयरपोर्ट पर स्पॉट हुए सोनू निगम*
> Posted: *सोनू निगम पहुंचे पिंक सिटी, जयपुर एयरपोर्ट पर आए नजर* `| Jaipur News`

The rule across all four: **the headline uses facts that are on the screen.** No new facts are added. The changes are joining lines, adding
the place or person, writing names in English, and sometimes a `!`.

### 2.3 What the speech adds

On short district clips the anchor **reads the headline aloud** in the first seconds, usually right after *"खबर ___ से है"*. Comparing the
posted headline with the Whisper transcript, letter by letter:

| Match with speech | Clips | What they are |
|---|---|---|
| Strong (≥ 0.6), spoken in the first 15% | 8 | Short crime and district stories: Kota, MBM Jodhpur, Jhunjhunu, Ajmer, the superstition case, Gehlot on sports |
| Partial (0.45–0.6) | 7 | The same facts in other words |
| Weak (< 0.45) | 11 | Speeches, events, airport arrivals, the vertical short. The title is not spoken. |

So:

- **Speech says which bar line is the lead.** It is the line the anchor reads first.
- **Speech cannot be the spelling source.** Whisper writes *संदिक दवस्ता* for *संदिग्ध अवस्था* and *जुन्जुनु* for *झुंझुनूं*. The on-screen
  text is typed by the graphics desk and is spelled correctly.
- **Speech fills gaps the screen leaves**: the village (*ककराय*), the count, a quote for a speech clip (*'पहले घोटालों की बात होती थी, आज
  निवेश की'*).
- On the vertical short, speech is **the only source**.

---

## 3. The place

| Seen | Rule |
|---|---|
| Kota slug `कोटा` → `\| Kota News` | **The place slug decides the suffix.** It is in the top left from the first story frame. |
| Haryana clip, Hisar in the bar, slug `हरियाणा` → `\| Haryana News` | Outside Rajasthan the suffix is **the state**, as the slug gives it… |
| `पटना` → `\| Patna News`, `वैशाली, बिहार` → `\| Bihar News` | …except a big city, which keeps its own name. |
| Bansur fire, shot at SMS Hospital Jaipur → `\| Jaipur News` | It is **where the footage is**, not where the event happened (the same fire from Alwar is `\| Alwar \| Rajasthan News`). The slug already reflects this. |
| `\| Jodhpur \| Rajasthan News` vs `\| Jodhpur News` | Both are used for the same city on the same day. The desk varies, so the system picks one default and lets the editor change it. |
| Statewide politics → `\| Rajasthan News` | No city, so the state. |

Also, a Rajasthan place gives brand tag `#RajasthanWithFirstIndia`. A place outside Rajasthan gives `#FirstIndiaNews` (6/6).

---

## 4. Hashtags, in order

| Slot | Rule | Seen |
|---|---|---|
| 1. Brand | `#RajasthanWithFirstIndia` (Rajasthan) or `#FirstIndiaNews` (outside) | 26/26 (2 have it second) |
| 2. Video | `#FINVideo` | **26/26** |
| 3. Place | `#Kota` or `#KotaNews` / `#JaipurNews`. Outside Rajasthan `#HaryanaNews`, `#BiharNews`. | 23/26 |
| 4. State | `#RajasthanNews` | 13/26, only on Rajasthan stories, so it is a **suggestion**, not automatic |
| 5. People | The name in CamelCase, often twice: `#PMModi #NarendraModi`, `#AshokGehlot #AshokGehlotStatement` | Any clip with a name strip or a named leader |
| 6. Event / place within the city | `#CylinderBlast #GasCylinderFire`, `#JaipurAirport`, `#SMSHospital`, `#MBMUniversity` | Most clips, 2–6 tags |
| 7. Beat | `#KotaCrime`, `#RajasthanCrime`, `#FireAccident`, `#PoliceAction` | Crime and accident clips |

Repeat stories reuse the same tag set: both Bansur posts share 11 of their tags. An ongoing story keeps its tags.

---

## 5. Mentions

| Story type | Who is tagged | Examples |
|---|---|---|
| Crime, accident in a district | **The district police only** | `@KotaPolice`, `@CP_Jodhpur`, `@AjmerpoliceR`, `@JhunjhunuPolice`, `@AlwarPolice`, `@jaipur_police`, `@police_haryana` |
| Politics | The leader + the party (+ the reporter) | `@ashokgehlot51 @INCRajasthan …`, `@RahulGandhi @kharge @INCRajasthan …` |
| A national leader's event | The leader (+ the office) | `@narendramodi @PMOIndia`, `@NitishKumar` |
| A place or department | Its account | `@Jaipur_Airport`, `@jdajaipur`, `@ForestRajasthan`, `@isro`, `@RajGovOfficial` (state schemes only) |
| A reporter card on screen | **The reporter's own handle, last** | Both clips with a reporter card tagged that reporter |

This is the same as what `backend/packages/core/src/breaking/handles.ts` found on 1,002 breaking posts. Police and the collector are
exclusive, a party comes with a politician, and the reporter goes last. The video desk follows the breaking desk's rules.

---

## 6. The video file

| Seen | Meaning |
|---|---|
| 28 s – 11 min, posted as cut for TV | Clips longer than 2:20 were posted, so the account has long-video upload. No trim is required. |
| 25 x 1280x720 horizontal, 1 vertical | Both shapes have to work. |
| It starts on the studio anchor for 2–6 s | Optional: a poster frame taken after the anchor. Not required. |
| Average shot 6–120 s | Scene cuts can find the first story frame (where the slug and bar appear). |

---

## 7. What this means for the system

1. **The frames come first.** The headline bar, place slug, name strip and reporter card carry nearly every part of the post, already
   spelled correctly. Read them first.
2. **Speech second.** It chooses the lead line, fills gaps, and is the only source for vertical shorts.
3. **Most of the post is rules, not writing.** The brand tag, `#FINVideo`, the place suffix, the place tag, police-only mentions and the
   reporter mention follow from the slug and the cards. Only the headline sentence (way B or D) needs a model or an editor.
4. **Everything else reuses the breaking desk's rules**: places, handles and the hashtag library.
5. **The editor still decides.** The desk rewrites (way D) on a third of the posts, so the system suggests and the editor approves.

Open points for the owner:

- Q1. Default suffix for a Rajasthan city: `| Jodhpur News` (17 posts) or `| Jodhpur | Rajasthan News` (3 posts)?
- Q2. Names in English in the headline (*PM Modi*, *SMS Hospital*). Always, or only for names the desk already writes that way?
- Q3. A caption over 280: allowed (the account does post them) or warn the editor?
