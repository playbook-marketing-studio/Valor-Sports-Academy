"""Load the Sept 16 - Oct 13 Valor calendar into social_posts (pending). Idempotent upsert."""
import json, os, urllib.request

CID = "8f39e5e3-37ae-436d-b3e1-249a27704630"
TAGS = "@michaelbibe4 @corey_bibe27"
LINK = "Sign up here: https://valorsportsacademywa.com/programs"
BASE_TAGS = "#ValorSportsAcademy #TriCities #RichlandWA #YouthSports"

def reel(id, date, sort, slug, ig, tags, note=None, fb=None):
    return dict(id=id, date=date, sort=sort, platform="Instagram + Facebook", format="Reel",
                image=f"/portal/valor/{slug}.mp4", images=[f"/portal/valor/{slug}.mp4"],
                caption=ig + "\n\n" + TAGS, fb_caption=(fb or ig).replace("DM us", "Message us") + "\n\n" + LINK, hashtags=tags)

def carousel(id, date, sort, imgs, ig, tags, fb=None):
    return dict(id=id, date=date, sort=sort, platform="Instagram + Facebook", format="Carousel",
                image=imgs[0], images=imgs, caption=ig + "\n\n" + TAGS, fb_caption=(fb or ig) + "\n\n" + LINK, hashtags=tags)

def static(id, date, sort, img, ig, tags, fb=None):
    return dict(id=id, date=date, sort=sort, platform="Instagram + Facebook", format="Static",
                image=img, images=[img], caption=ig + "\n\n" + TAGS, fb_caption=(fb or ig), hashtags=tags)

posts = [
 reel("valor-2026-09-16-qa-first-session", "2026-09-16", 40, "valor-qa-first-session",
  "What does the first session at Valor look like? 🦁\n\nCoach Corey walks through it. Your athlete comes in, we build a baseline of where they are right now, and the plan gets built from there. Nobody gets handed a generic workout on day one.\n\nThe first session is the easiest one to say yes to. Bring your athlete in and see it for yourself.\n\nAsk a Valor Coach, episode 1. Drop your questions below and the coaches will answer them.",
  BASE_TAGS + " #AskAValorCoach #FirstSession"),
 reel("valor-2026-09-18-every-athlete", "2026-09-18", 41, "valor-every-athlete-every-sport",
  "Every athlete. Every sport. 🦁\n\nVolleyball, soccer, basketball, softball, cheer, football. Speed, strength and confidence look the same on the turf no matter what jersey your athlete wears on game day.\n\nThe fall block is built around each athlete's own season and schedule. Mornings at 5:30, evenings at 6 and 7, Mon thru Thu.\n\nDM us with your athlete's sport and we'll point you to the right class.",
  BASE_TAGS + " #GirlsWhoLift #AllSports #KennewickWA #PascoWA"),
 carousel("valor-2026-09-19-week-one-carousel", "2026-09-19", 42,
  ["/portal/valor/shoot-3435.jpg", "/portal/valor/shoot-3443.jpg", "/portal/valor/shoot-3558.jpg", "/portal/valor/shoot-3533.jpg", "/portal/valor/shoot-3449.jpg", "/portal/valor/shoot-3565.jpg", "/portal/valor/shoot-3428.jpg", "/portal/valor/shoot-3471.jpg"],
  "Inside the first week of fall training. 🦁\n\nFootwork on the turf, first reps in the rack, coaches in the middle of it. This is what a Valor session actually looks like.\n\nThe block runs through Thanksgiving weekend and there's still room in every class time. Swipe through, then DM us to get your athlete in.",
  BASE_TAGS + " #FallTraining #SpeedAndAgility"),
 reel("valor-2026-09-22-qa-smallest", "2026-09-22", 43, "valor-qa-smallest-on-team",
  "What do you tell a parent whose kid is the smallest on the team? 🦁\n\nCoach Affholter has heard this one for decades. His answer: hang in there. The body grows, but the work has to already be there when it does. Consistent training is a long game, not a month, and the smallest thing an athlete can do is keep showing up so they're stronger when their size catches up.\n\nIf that's your athlete, this is the place for them. DM us.\n\nAsk a Valor Coach, episode 2.",
  BASE_TAGS + " #AskAValorCoach #YouthFootball #KennewickWA"),
 reel("valor-2026-09-24-kid-who-doesnt-quit", "2026-09-24", 44, "valor-kid-who-doesnt-quit",
  "This is where the kid who doesn't quit gets built. 🦁\n\nOne athlete, one rack, one more rep. Nobody's watching and he's doing it anyway. That's the whole point of the fall block.\n\nMornings 5:30, evenings 6 and 7, Mon thru Thu. DM us to get your athlete in.",
  BASE_TAGS + " #Dedication #StrengthTraining"),
 static("valor-2026-09-26-rental", "2026-09-26", 45, "/portal/valor/rental-v1.jpg",
  "Need a floor for your team? 🦁\n\nValor's indoor turf and full weight room at 1973 Fowler Street in Richland are open to outside groups by the hour. Youth teams use it for practice when the fields are dark, wet or frozen. Fitness groups run their own sessions on the turf and in the weight room. Basketball programs use it for conditioning between games.\n\nYou get the full turf floor, the weight room and racks, and your own coach running your own plan, at times that work around Valor's class schedule.\n\nSend us the day and time you have in mind and a coach will confirm what's open. DM us or call or text 509-987-4612.",
  "#ValorSportsAcademy #TriCities #RichlandWA #KennewickWA #PascoWA #IndoorTurf #FacilityRental #YouthSports",
  fb="Need a floor for your team? 🦁\n\nValor's indoor turf and full weight room at 1973 Fowler Street in Richland are open to outside groups by the hour. Youth teams use it for practice when the fields are dark, wet or frozen. Fitness groups run their own sessions on the turf and in the weight room. Basketball programs use it for conditioning between games.\n\nYou get the full turf floor, the weight room and racks, and your own coach running your own plan, at times that work around Valor's class schedule.\n\nSend us the day and time you have in mind and a coach will confirm what's open. Message us or call or text 509-987-4612."),
 reel("valor-2026-09-28-qa-corey", "2026-09-28", 46, "valor-qa-corey",
  "Sit down with Coach Corey. 🦁\n\nWhat the gym teaches beyond the lifts. What championship culture looks like day to day. What it's like building this place in the town he grew up in. The undersized kid he was, and what he sees in the kids who walk in now.\n\nAnd the one a lot of parents ask: what should you notice after month one? His answer is in the last 20 seconds.\n\nAsk a Valor Coach, the long one. Questions for the coaches go in the comments.",
  BASE_TAGS + " #AskAValorCoach #ChampionshipCulture"),
 reel("valor-2026-09-30-qa-varsity", "2026-09-30", 47, "valor-qa-varsity-vs-jv",
  "What separates athletes who make varsity vs JV? 🦁\n\nDecades of coaching and Coach Affholter says the biggest thing he sees is the time an athlete puts into the weight room and their training. The ones who train consistently keep climbing through their high school career. The ones who don't peak early, in any sport, at any level.\n\nIf your athlete wants the jump, this is where the time gets put in. DM us.\n\nAsk a Valor Coach, episode 3.",
  BASE_TAGS + " #AskAValorCoach #Varsity #HighSchoolSports"),
 reel("valor-2026-10-02-qa-speed-agility", "2026-10-02", 48, "valor-qa-speed-agility-work",
  "Does speed and agility training actually work? 🦁\n\nCoach Michael breaks it down. Every change of direction on the field is an acceleration, zero to a hundred, and then a deceleration. The stopping part is the piece that rarely gets trained, and it's exactly what we work on here.\n\nAsk a Valor Coach, episode 4. Want the full answer on what a speed session looks like? Link in bio.",
  BASE_TAGS + " #AskAValorCoach #SpeedAndAgility #ChangeOfDirection"),
 carousel("valor-2026-10-03-coaches-carousel", "2026-10-03", 49,
  ["/portal/valor/shoot-3604.jpg", "/portal/valor/shoot-3533.jpg", "/portal/valor/shoot-3558.jpg", "/portal/valor/shoot-3471.jpg", "/portal/valor/shoot-3606.jpg", "/portal/valor/shoot-3609.jpg"],
  "The people running your athlete's training. 🦁\n\nCoach Michael Bibe, Coach Corey Bibe and Coach Randy Affholter. Two Tri-Cities natives who played college ball and came home, and a WSFCA Hall of Fame head coach on the morning class.\n\nCome meet them. Book a free assessment, link in bio.",
  BASE_TAGS + " #MeetTheCoaches #KennewickWA"),
 reel("valor-2026-10-06-qa-how-often", "2026-10-06", 50, "valor-qa-how-often-train",
  "How often should an athlete train? 🦁\n\nCoach Corey played college ball, and his answer for a youth athlete is the same one he lived by: all year round, and consistency is the key. Off-season is for conditioning and correcting weaknesses. In-season is for maintaining strength and maximizing performance.\n\nValor runs both. In-season 1x or 2x a week, off-season 3x. DM us with your athlete's season and we'll set them up.\n\nAsk a Valor Coach, episode 5.",
  BASE_TAGS + " #AskAValorCoach #InSeasonTraining"),
 reel("valor-2026-10-08-qa-what-age", "2026-10-08", 51, "valor-qa-what-age-start",
  "What age should an athlete start training? 🦁\n\nThe question we get more than any other. Coach Michael answers it straight, and whatever the age, the training has to be built for it. That's why Valor groups every class by age, 8 to 18, and an 8-year-old and a 16-year-old are never doing the same session.\n\nAsk a Valor Coach, episode 6. Not sure which class fits? DM us your athlete's age and sport.",
  BASE_TAGS + " #AskAValorCoach #YouthAthlete"),
 reel("valor-2026-10-10-qa-weight-room", "2026-10-10", 52, "valor-qa-weight-room",
  "Why should all athletes be in the weight room? 🦁\n\nCoach Affholter's main reason isn't about getting bigger. It's staying healthy. A lot of athletes skip training in season and lose the strength they built over the summer. Speed drops, injury risk goes up. Valor's in-season program is built so athletes keep lifting at intensity and hold onto what they earned.\n\nAsk a Valor Coach, episode 7. DM us to get your in-season athlete in.",
  BASE_TAGS + " #AskAValorCoach #StrengthTraining #InSeasonTraining"),
 reel("valor-2026-10-13-qa-how-different", "2026-10-13", 53, "valor-qa-how-valor-is-different",
  "How is training at Valor different from team practice? 🦁\n\nCoach Michael has coached youth football and high school ball. Team coaches are great, and they're coaching a whole roster at once, so the individual stuff is hard to get to. Valor is where an athlete gets the hands-on work on the details that make the biggest difference in their performance.\n\nAsk a Valor Coach, episode 8. DM us to book a free assessment and see it in person.",
  BASE_TAGS + " #AskAValorCoach #AthleticPerformance"),
]

def q(s): return "'" + s.replace("'", "''") + "'"
vals = []
for p in posts:
    vals.append(f"({q(p['id'])},'{CID}',{q(p['platform'])},{q(p['format'])},'{p['date']}',{q(p['caption'])},{q(p['hashtags'])},{q(p['image'])},'pending',{p['sort']},{q(json.dumps(p['images']))}::jsonb,{q(p['fb_caption'])})")
sql = ("insert into social_posts (id,client_id,platform,format,date,caption,hashtags,image,status,sort,images,fb_caption) values\n" + ",\n".join(vals) +
       "\non conflict (id) do update set caption=excluded.caption, fb_caption=excluded.fb_caption, hashtags=excluded.hashtags, image=excluded.image, images=excluded.images, date=excluded.date, sort=excluded.sort, format=excluded.format, updated_at=now();\n"
       f"select date,id,format,image from social_posts where client_id='{CID}' and date>='2026-09-16' order by date;")
req = urllib.request.Request("https://api.supabase.com/v1/projects/jggwanbbfaygsjobzjcj/database/query", data=json.dumps({"query": sql}).encode(),
                             headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json", "User-Agent": "playbook-cli"})
print(urllib.request.urlopen(req).read().decode())
