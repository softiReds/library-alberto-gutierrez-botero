# User stories and requirements — Library system

**Actors:** Visitor (public) · Coordinator (management, single shared login)
**Scope:** Public website + Internal management system
**Estimated volume:** 500–2,000 books (drives search/pagination design from day one)
**Tech stack:** C# .NET (backend) · PostgreSQL (database) · HTML/CSS/JS vanilla (frontend, no framework) · UUID for all IDs

---

## 1. Public website

### 1.1 Institutional content
- As a visitor, I want to see who we are, vision, mission and values so I can learn about the library.
- As a visitor, I want to read the regulations so I know my rights and duties as a member.
- **Acceptance criteria:** static content, hard-coded into the HTML by the development team. Future changes require a code update — there is no editing panel for the coordinator.

### 1.2 Catalog (public browsing)
- As a visitor, I want to search books by title, author or subject so I know if they're available before visiting.
- As a visitor, I want to see a book's status (available / on loan) so I don't make a wasted trip.
- **Acceptance criteria:** the public catalog reads from the same database the coordinator manages — one single catalog, not two.
- **Minimum fields to display:** title, author, classification/subject, availability. (Internal fields like price, supplier, internal notes stay hidden.)
- **Design note:** with 500–2,000 books, indexed search (title/author) and pagination are needed from launch, not as a later improvement.

### 1.3 Digital resources (online reading) — low priority
- As a visitor, I want to access books from external public databases to read online when the physical copy isn't available.
- **Confirmed with the coordinator:** lowest priority in the project — built last, if time allows.
- **Source research:**
  - Colombian platforms (BibloRed / Biblioteca Digital de Bogotá, Biblioteca Nacional de Colombia, Banco de la República) have strong digital catalogs, but no evidence of a public developer API was found — they work as browsing websites, not as an integrable service. The realistic option there is an external link, not a real integration.
  - **Project Gutenberg**, via the unofficial **Gutendex** API, offers a free public endpoint to search and list public-domain books (mostly English, some Spanish).
  - **Open Library / Internet Archive** also exposes a public API for metadata and, in some cases, online reading.
  - **Recommendation:** start with Gutendex or Open Library as the real technical proof of concept (they have an API), and keep the Colombian catalogs as simple external links for this first version.

### 1.4 Events and gallery
- As a visitor, I want to see the events/workshops offered, with date, start time and end time, so I can decide whether to attend.
- As a visitor, I want to see photos of past events in a gallery to get a feel for the library.
- **Acceptance criteria:**
  - The photo gallery is static content (fixed images embedded by the development team) — the coordinator does not upload or manage photos.
  - Events are listed dynamically from the database, each with date, `start_time`, and `end_time`.

### 1.5 Featured (books and events)
- As a visitor, I want to see a section of books and events flagged as featured by the library so I can discover curated content.
- **Acceptance criteria:** implemented via a `featured` boolean field directly on `Book` and `Event` — there is no separate recommendations table. The public website simply queries items where `featured = true`.

### 1.6 Suggestion box
- As a visitor, I want to submit a suggestion or comment so the library can improve its service.
- As a coordinator, I want to receive each suggestion by email and also see it on a panel inside the system, so I don't have to rely only on checking email.
- **Acceptance criteria:** every submitted suggestion triggers an email AND is stored in the system (dual record, confirmed by the coordinator).

### 1.7 Visit counter
- As a visitor, I want to see the total number of visits to the site to get a sense of its reach.
- **Acceptance criteria:** counts total visits (not unique visitors), publicly visible, updates automatically.

---

## 2. Management system (coordinator)

### 2.1 Catalog
- As a coordinator, I want to register a new book (title, author, classification, barcode, status) to keep the inventory up to date.
- As a coordinator, I want to retire a lost or damaged book so it no longer shows as available.
- As a coordinator, I want to search a book by title or barcode to find it quickly when lending it.
- As a coordinator, I want to flag a book as featured so it appears in the public website's featured section.
- **Validation rules (based on real errors found in the current spreadsheet):**
  - Barcode unique and required for new books; older books without one can be flagged as "pending barcode."
  - Title and author required.
  - Status controlled by a fixed enum: Available / On loan / In-house reading / Lost / Retired.

### 2.6 Event management
- As a coordinator, I want to create and edit events (title, date, start time, end time, description) so they can be published on the public website.
- As a coordinator, I want to flag an event as featured so it appears in the public website's featured section.
- **Confirmed with the coordinator/team:** events are created and managed directly from the management system — this is a real module, not static content loaded by the dev team.

### 2.2 Memberships
- As a coordinator, I want to register a new member with their personal data so I can lend them books.
- As a coordinator, I want to check whether a person is already a member (by ID number) to avoid duplicates.
- **Fields** (based on the current form, with redundancies clarified in the meeting):
  - ID type and number, date of birth, country of nationality
  - Email address (with confirmation)
  - Gender, first name, last name, occupation, education level
  - Locality, neighborhood, address
  - **Contact phone and name** (the member's own phone number)
  - **Emergency contact** (a different person and number — confirmed as two separate pieces of data, both stored independently)
  - Would they like to receive the cultural agenda?
  - Acceptance of the responsibility agreement (required checkbox, full legal text)
- **Acceptance criteria:** the form replaces Google Forms + notebook + spreadsheet — a single place to register.

### 2.3 Attendance
- As a coordinator, I want to log each library visit (name, age, phone, date) quickly, to generate the monthly statistics I currently do by hand.
- **Design decision:** Attendance and Membership are two **separate, independent** entities, with no automatic merging between them.
  - Attendance is a simple, fast record: date, age, gender, and optionally name/phone — no ID document or full membership form required.
  - If a visitor decides to become a member, the coordinator simply creates a new record in the Memberships module (may re-type the same data if they wish, as a separate manual action) — there's no automatic "visitor to member" conversion.
  - Benefit of this separation: attendance counting stays quick and frictionless (useful for statistics), while membership keeps its full validation rigor (ID, responsibility agreement, etc.) only for people who will actually borrow books.

### 2.4 Loans and in-house reading
- As a coordinator, I want to register a book loan to a member with a due date so I know who has each book.
- As a coordinator, I want to mark a book as returned and record its condition (good/damaged) to keep a history for that copy.
- As a coordinator, I want to log in-house reading (books read without being taken home) in a general way, without needing to link it to a specific person.
- **Validation rules (based on real errors found in the current spreadsheet):**
  - Loan date and due date in a single format (date picker, not free text).
  - Loan status controlled by a fixed list: On loan / Returned / Overdue (not free text like "ok" or "yes").
  - Visual alert for overdue loans (due date passed and not marked returned).

### 2.5 Reports
- As a coordinator, I want to see how many books were loaned in a month to measure library usage.
- As a coordinator, I want to see how many books were lost to keep track of the inventory.
- As a coordinator, I want to see attendance by age and gender, cross-tabbed by month, to replace the manual spreadsheet I keep today.
- As a coordinator, I want to see how many books were read in-house vs. taken home.
- **Acceptance criteria:** all these reports are generated automatically from the Catalog, Loans, In-house reading and Attendance modules — no manual re-entry. Grouped into two views: catalog/loan reports and reading-room/attendance reports.

---

## 3. Pending / open questions

- When the Digital resources module (low priority) is actually built, confirm with the coordinator whether to use Gutendex/Open Library as a real integration or just links to the Colombian catalogs.
