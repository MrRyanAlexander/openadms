# Open ADMS — Lists a firm can extend

✅ **Approved**

← [Index](INDEX.md)

> **Approved by the user 2026-09-29** (ADR-269). Written (ADR-070) from the user's answer to Q-65: *"Fixed lists are too ridgid. These lists need to
> be able to be added to at the global level."* Brought up to today's rules on 2026-09-29 (ADR-246):
> no fee kinds, site facts in place of site options, field event kinds in place of ticket types.
> Names follow `spec/CONVENTIONS.md`; the model around these lists is `adms-data-model` §3.2.

Every pick-list in Open ADMS falls into one of three groups. Knowing which group a list is in
tells you whether a firm can add to it after installing, and whether adding a value needs code.

**Rules for every extendable list:**
- **Global**: added once, available to every project, like clients and contractors (field tags are
  the one project list).
- **Admin-managed**: admins add, rename and archive values; every change is audited; nothing is
  deleted.
- **Picked, never typed**: monitors choose from the list, which keeps reports clean.
- **"Other (typed)"** is allowed only on lists that **describe** something (e.g. vehicle type),
  never on lists that **drive behaviour or billing**. An admin can promote a typed "Other" value
  into the list.
- **Seed values** ship with the install; a firm can add to or archive them.
- Where a value **drives behaviour**, the behaviour is a setting on the value (a checkbox), not
  code. Example: a program type's "requires ROE" box.

---

## Group 1 — Extendable: the firm adds values after install

| List | Where it's used | Starts with | Setting on each value |
|---|---|---|---|
| **Program types** | Project setup | ROW · PARKS · PPDR · WATERWAY | **Requires ROE** (also ticks a new project's "Allow split loads" setting, which the admin can change, ADR-137) |
| **Declaration reference types** | Declaration event | FEMA disaster (DR) · FEMA emergency (EM) · State · Local · Internal | — |
| **Vehicle types** | Certification | Dump Truck · Semi-Trailer · Hydraulic Dump Trailer · Non-Hydraulic Dump Trailer · Self-Loading Truck · Other (typed) | Crew or container(measured)|
| **Vehicle features** | Certification | Sideboards · Tail Gate Extension · Dog Box · Wheel Wells · Curved/Angled Sides/Floor · Other (typed) | Each feature labels a **measured box** after the primary, marked **add or subtract** and **÷2 or not** (ADR-076) |
| **Crew types** | Crew certification (the crew certification is the crew, ADR-228) | Bucket Truck · Skid Steer | — |
| **Kinds of unit rate work** | Project setup; **each unit rate pay item names one** (ADR-127); the unit rate screen | Hangers · Leaners · **Stumps** (built in, ADR-198) · HHW · White Goods · Crew time | **Count shape**: a number, an itemised list of counts, or an itemised list of **hours** (crew time, ADR-084; bills the highest item's hours, ADR-126) |
| **Itemised item names** (per kind) | Unit rate capture | HHW: paint cans, propane tanks, pesticide… · White goods: fridge with freon, fridge without freon, freon extracted, **freon staged** (ADR-126), oven, microwave… · Crew time: Skid Steer, Truck, Sign… | — (stored with the ticket, ADR-040) |
| **Payable types** (the work a pay item prices) | Pay items: **every pay item has one**, loads, haul-outs and fees included (ADR-207, 221); the unit rate list shows each once (ADR-213); exported as the type column (ADR-173) | USACE's twelve umbrella debris types plus Crew time and Tipping fee (`spec/CONVENTIONS.md` §4) | — |
| **Debris types** | The firm's library; **a project adds them to each form**, named as the contract names the work (Mulch and Ash are two), and monitors pick them on loads and haul-outs; rules test them (ADR-074, 211, 214) | The 12 USACE categories; firms add e.g. Marine-Vegetative, Marine-Construction | On each form's entry: **Reduced**, a **reduction method**, **Hidden on phones** (ADR-214). No USACE category setting (ADR-081) |
| **Reduction methods** | A debris type's entry on a form | Grinding · Incineration · Compaction (ADR-214) | — |
| **Disposal site types** | Disposal sites; what the *Disposal site type* criterion tests | **TDSR/DMS · Final Disposal (FDS) · Transfer Station · Other** *(ADR-190, 215; HHW is not a type)* | — (descriptive; what a site does is its **site facts**, Group 2) |
| **Site labels** | Disposal sites, beside the site facts | Empty; the firm adds its own, e.g. burn site, grinding | — (labels only, ADR-194, 215) |
| **Incident types** | Incident reports; the first list after "start incident" (ADR-127) | Property damage · Personal injury · Near miss · Equipment failure · Environmental · Other | **Sub-types** under each type: firm-added, empty at install (ADR-129, 137) |
| **Reasons** *(ADR-173)* | Voiding, a typed ticket number, accepting a flag (ADR-166), a record created in the back office (ADR-156), a phone taken out of service (ADR-530) | Defaults shipped per use | Which uses each reason is offered for |
| **Survey / ROE work types** | The first list after "start survey" (ADR-129) | Pre-work survey · Post-work survey · ROE | — |
| **Time-clock activities** | Activity lines the app can't pre-fill (ADR-241) | Travel · Standby · Training | — |
| **Field tags** *(a project list)* | Picked optionally by a collecting or unit rate monitor; read only by the *Field tag* criterion and exports (ADR-216, 218) | Empty; e.g. Mixed | — |

There are **no fee kinds** (ADR-246): a load's lines are kept apart by their transaction # slot
(ADR-118), a tipping fee line is known by the site's link to its tipping fee pay item (ADR-220,
222), and the **payable type** groups lines in exports.

## Group 2 — Fixed: each value has its own code in the engine

Adding a value to one of these means writing code, so a firm can't add one from a screen. That's
not rigidity for its own sake: each value *is* a piece of behaviour.

| List | Values | Why it's fixed |
|---|---|---|
| **Field event kinds** | `COLLECTION` · `DISPOSAL` · `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` · `UNIT_RATE` (shown `COL` `DIS` `HOC` `HOD` `URT`) | Each is a step of a workflow with its own capture and pairing (ADR-236). A citizen drop-off is a log, not a ticket (ADR-184) |
| **Workflows** | Load · Haul-out · Unit rate | Each has its own number series and its fixed events (ADR-062, 236) |
| **Statuses** | Pending · Completed · Manual review · Void | The engine and the billing rules are written against them (ADR-060) |
| **QC statuses** | QC Review · QC Approved · QC Issues · QC Void | Set only by people; only QC Approved locks (ADR-107, 121) |
| **Billing units** | `CY` · `TN` · `EA` · `LB` · `HR` · `CREW_DAY` · `TBN` | Each unit has its own quantity math (capacity × load call, apportioned weight, count, pounds, hours…; `spec/CONVENTIONS.md` §4). A firm names and prices **pay items** freely; the unit underneath must be one the engine knows |
| **Site facts** | Takes loads · Haul-outs leave here · Charges a tipping fee · Ineligible site (yes/no on each site) | Each drives a check or the tipping fee pay item (ADR-215, 222). *Haul-outs leave here* can be ticked only on a site of the built-in TDSR/DMS type (ADR-298) |
| **Rule actions** | *Add transaction #n* · *Remove transaction #n* · *Void ticket* | The engine applies them in a fixed order (ADR-118, 131) |
| **User roles** | Admin · Manager/analyst · Monitor · Read-only viewer | Permissions are enforced in code (ADR-050) |

## Group 3 — Records, not lists

These look like pick-lists on a screen but are full records that admins already create and
reuse: **clients, declaration events, contractors, contracts, pay items, rules, disposal
sites, ROEs, users, certifications.** A firm's **added form fields** on surveys, ROE forms,
incidents and drop-off logs (text, number, yes/no, pick from a list, photo) are records too
(ADR-160). An ROE's **scope choices** are not these: they are picked from what the project already
has, its load form's debris types and its unit rate payable types (ADR-293, amending ADR-181).

**Contractor tiers aren't a list either:** a project may have several primes, and each prime's
subs are its own, in **at most two tiers**, typed in at certification under the prime (ADR-108).
"Prime", "1st tier" and "2nd tier" are positions, not list values.

## Built-in values plus the firm's own *(ADR-194)*

Some lists need both: a few values the **system acts on**, and any number the **firm adds** for its
own use. The kinds of unit rate work are the example: **Stumps** is built in (its screen takes the
stump readings and works out the fill, ADR-198), and a firm adds the kinds its contract needs. This
section is how such a list is designed, coded, kept and explained. Follow it for every list of this
kind.

**The idea in one sentence.** The system only ever acts on a built-in value, and it recognises that
value by a **fixed key** that never changes; everything a firm adds is a **label** people pick, search,
filter and export by, and nothing more.

**Why.** A firm must be free to rename, translate and add values without a code change, and the
system must never break or change behaviour because someone renamed something. Tying behaviour to a
key, not a name, gives both.

**What each value has.**

| | Built-in value | A firm's value |
|---|---|---|
| **Key** | Fixed, e.g. `STUMPS`; ships with the install; never changes | None |
| **Name** | Shipped default ("Stumps"); the firm may rename it; translatable (ADR-172) | Typed by an admin; translatable |
| **Behaviour** | Whatever the ADR for that key says (e.g. Stumps: the stump readings and the fill, ADR-198) | None, ever |
| **Add** | Only by a release: a code change and an ADR | Admin screen, any time |
| **Archive** | Never (it's part of the product) | Yes: hidden from new picks, kept on old records; **never deleted** |
| **Audit** | Every rename is audited | Every add, rename and archive is audited |

**Coding it.**
- Code, rules and the phone test **the key**, never the name: `kind.key === 'STUMPS'`, never
  `kind.name === 'Stumps'`. A test proves that renaming a built-in value changes no behaviour.
- The built-in keys live in one place in the shared domain package, as a closed set; the database
  holds the values, with the key column empty for a firm's own.
- Seed values ship with the install; an upgrade adds a new built-in value without touching the
  firm's own or its renames (see Q-167, upgrades).
- Values reach phones in the **setup manifest** with their key and name; the phone shows the name.
- Exports and reports carry the **name** (what people read); exports for other systems may add the
  key.
- New behaviour is **never** hung on a firm's value. If a firm's value starts needing behaviour, it
  becomes a built-in value in a release, with an ADR.

**Keeping it.** An admin adds, renames and archives the firm's values; renames a built-in value if
the firm uses another word; can't archive a built-in value. Nothing is deleted. Each change has an
audit record with who and when.

**Explaining it** (to a new team member, a client, or another agent). "Some values make the system
do something: those come with Open ADMS, and you can rename them but not remove them. The rest are
your own: add as many as you like, and use them to find and report on things. Your own values never
change what the system does." Say **built-in value** and **the firm's own value**, not "system enum"
or "custom field".

---

**Build note (for agents):** how extendable lists are stored (one table per list, or one shared
list table) is an engineering choice to record as an ADR when the first one is built. Whatever
the shape, a value that drives behaviour carries that behaviour as a column, and no list value
is ever hard-deleted.

**Built 2026-10-02 (ADR-302, agent default):** one table per list (`spec/DATA-MODEL.md` §2.3). The
built-in keys are one closed set in `packages/domain`; the database lets only a release write a key
and refuses archiving a value that has one; a new list is guarded in one line (`guard_list`).

## What ships *(ADR-302; agent defaults where the table above gives none or ends in "…")*

The installer's seed writes these once, into an empty list. After that every value is the firm's to
rename, reorder, archive and add to; the seed never touches a list again, except to add a built-in
value a later release brings. The user may overturn any of them.

| List | Starts with |
|---|---|
| Program types | ROW · PARKS · PPDR · WATERWAY. **Only PPDR starts with *Requires ROE* ticked** (private property; the other three are public property) |
| Declaration reference types | FEMA disaster (DR) · FEMA emergency (EM) · State · Local · Internal |
| Debris types | C&D · Vegetative · Metals · Concrete · White Goods · Titled Property (vehicles and vessels) · HHW · RACM · Soil · Leaners · Hangers · Stumps (`spec/CONVENTIONS.md` §4) |
| Payable types | The same twelve, then Crew time · Tipping fee |
| Reduction methods | Grinding · Incineration · Compaction |
| Kinds of unit rate work | Hangers, Leaners, **Stumps** (key `STUMPS`): a number · HHW, White Goods: counts by item · Crew time: hours by item |
| Item names | HHW: Paint cans · Propane tanks · Pesticide. White Goods: Washer · Dryer · Fridge, freon recovered · Fridge, no freon · Fridge, freon staged · Oven · Microwave (the names `spec/RULES.md` §9 uses). Crew time: Skid Steer · Truck · Sign |
| Vehicle types | Dump Truck · Semi-Trailer · Hydraulic Dump Trailer · Non-Hydraulic Dump Trailer · Self-Loading Truck, each certifying a measured container. "Other (typed)" is not a value: it is the text beside the pick |
| Vehicle features | Sideboards · Tail Gate Extension · Dog Box · Wheel Wells · Curved/Angled Sides/Floor ("Other (typed)" as above) |
| Crew types | Bucket Truck · Skid Steer |
| Disposal site types | **TDSR/DMS** (key `TDSR`) · **Final Disposal** (key `FINAL_DISPOSAL`) · Transfer Station · Other |
| Incident types | Property damage · Personal injury · Near miss · Equipment failure · Environmental · Other |
| Reasons | Voiding: Duplicate ticket · Work never happened · Not eligible work. A typed ticket number: Barcode damaged · Scanner not working. Accepting a flag: Photos confirm · Confirmed with the monitor. A record created in the back office: Device failed · Device lost. A phone taken out of service (ADR-530, agent default): Lost in the field · Stolen · Broken · Replaced (a new installation's; on one whose reasons list holds values already, the firm adds its own, the seed adding none but a built-in value's). Each is offered for that one use; the firm may offer one for several |
| Survey / ROE work types | **Pre-work survey** (key `PRE_WORK`) · **Post-work survey** (key `POST_WORK`) · **ROE** (key `ROE`) |
| Time-clock activities | Travel · Standby · Training |
| Site labels · incident sub-types · field tags | Empty |

---

## User notes (2026-09-24), kept verbatim

> **Vehicle features:** Yes! In fact after the primary , box 1-N can be additions or deductions. That's where we list a feature with its measurement and mark if its an addition or subtration and what kinda math used to calculate it (divided by 2 or not?). I thhought this was clearly outlined in the certifications. If not we need to be clear on the primary and box measurement details. That math and understanding has to be perfect.
>
> **Debris types:** we want to be able to add more debris_types and we want to be able to select whatever we need on a project, not be forced into a set type. Say we want to define Marine-Vegetative or Marine-Construction, because the contract specifices removal of a given debris type that isn't listed.
>
> **Contractor tiers:** Exactly.. We want to have 1st and 2nd tier subs.. Often you have a Prime hauler and under them are various subs, sometimes you even have subs under subs.
