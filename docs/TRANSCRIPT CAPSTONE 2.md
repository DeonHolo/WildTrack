---
title: "IT411 Capstone Consultation Transcript (Parts 01 - 06)"
course: "IT411 - Capstone and Research 2"
academic_term: "4th Year BSIT - 1st Semester"
total_parts: 6
duration_total: "~48 minutes 38 seconds (6 parts @ ~8m 06s each)"
primary_language: "Cebuano / Bisaya and English (Bislish)"
participants:
  - id: "Adviser"
    role: "Capstone Adviser / Course Instructor"
    perspective: "Dual perspective: Evaluator/Instructor and System User/Beneficiary"
  - id: "Student 1"
    role: "Lead Student Developer / Speaker"
    perspective: "Explaining system architecture, MVP features, and constraints"
  - id: "Student 2"
    role: "Student Team Member / Co-Developer"
    perspective: "Interjecting technical edge cases, metadata considerations, and sheets testing"
topics:
  - "Google Sheets vs. Custom In-App Form Builder"
  - "Student Authentication & Data Privacy (OAuth 1-to-1 Mapping vs. OTP)"
  - "Evaluation Frameworks & SMART Goals (SUS 80% Baseline vs. AI Evaluation)"
  - "Document Integrity, Template Comparison & Truthfulness Verification"
  - "Google Drive API Metadata Tracking (Revision History & Last Modified Timestamps)"
  - "Two-Way Writeback to Google Sheets vs. Local Tracking"
---

# IT411 Capstone Consultation Transcript

## Executive Summary & Agent Retrieval Index

This consultation documents a capstone advising session for a BSIT capstone project focused on automating academic deliverable submissions, form generation, document verification, and tracking for IT capstone courses.

### Key Takeaways & Action Items
1. **Form Automation & Source of Truth**:
   - The Adviser's current tracker sheet contains deliverable columns, but is not designed as an automation schema.
   - The team can either define an input schema in Google Sheets (specifying field types, dropdowns, allowed submission count) or allow in-app form configuration.
   - The Adviser prefers the familiarity and flexibility of Google Forms (dropdowns, open text, lists) rather than rigid automatic form generation.
2. **Student Authentication & Privacy**:
   - Current search-by-ID feature violates student data privacy because any student can look up another student's record and status.
   - OTP was considered but deemed poor UX.
   - **Recommended Solution**: Enforce a strict 1-to-1 association where each student's authenticated Google Account is mapped exclusively to their record in the class roster upon first login.
3. **Research Framework & SMART Goals**:
   - SUS (System Usability Scale) usability score of 80% is an assumed baseline in 4th year BSIT (since HCI course) and does not need to be a primary SMART research goal.
   - Focus research measurements on **AI-specific performance** (e.g., accuracy of document checking, hallucination rates) and **document truthfulness verification**.
4. **Document Checking vs. Content Truthfulness**:
   - Offline document checks (file extension, file size, PDF corruption, readability) are functional but basic.
   - Simple header/template comparison is vulnerable to students submitting blank templates or filler text ("blah blah") just to beat submission deadlines.
   - The system should verify actual content truthfulness and relevance against deliverable requirements (e.g., distinguishing an SRS from an SPMP).
5. **Revision History & Anti-Tampering**:
   - Students frequently submit empty documents before deadlines and edit them afterwards.
   - The system must leverage the Google Drive API to inspect file metadata: `createdTime`, `modifiedTime`, and revision history.
   - The tracker should display multiple submission versions, modification dates, and authors.
6. **Sheets Writeback & User Roles**:
   - The system must support role separation: Students (form respondents), Teachers/Advisers (creators and reviewers), Admin (Sir Musa / system admin).
   - The system needs a testing workspace and Google Sheets integration/writeback so instructors can open submitted links directly from the sheet.

---

## Chronological Transcript

### Part 01: Tracker, Class Record, and Automation Inputs
*File: `TRANSCRIPT_part-01.mp3` | Duration: 08:06*

- **Adviser:** Relevant na siya sa ani nga deliverable like... something... Dili man ta mag-istorya’g capstone, pero generally, murag mga capstone-like nga type of courses, pwede gyud ana niya.
- **Student 1:** Mao bitaw ni sir, kay kuan man... we re- kuan gyud mi...
- **Student 2:** Project 1.
- **Student 1:** Hyperfocused man kaayo for your kuan man gud sir, unya we didn't see a field for kuan, we didn't add na lang sad. Kay unya I think wala man say field—wala man say kanang data for... unsa na? Section ba? Sa capstone kay sagol baya tanan, G5, G7. So wala, wa ko nagita'g so far nga naay... usa ka...
- **Adviser:** Wala siya.
- **Student 1:** ...usa ka section ng tawo.
- **Adviser:** Relevant na lang siguro... kay pag-filter nako ana sa... kanang tanan mga submission, unya i-reflect na sa class record kay... Lahi-lahi baya na nga section inig submit nako ana sa AIMS. Per section baya ang submission, dili baya na usaon nako tanan capstone og submit.
- **Student 1:** So wala... ang kanang data anang G5 to G7, naa na sa tracker? Sa sheets, wala? Unsa nga section ang tawo?
- **Adviser:** Naa sa class record, ang section gyud. Ang course, ang year... Wala na diha, tracker na.
- **Student 1:** Aw, dara bag-o!
- **Adviser:** Naa diha ang section.
- **Student 1:** Okay, that's good! Naa na diay. Kadto's lapaglas?
- **Adviser:** So, sige ani... I understand na inyong thought process ba. So ang inyong gibasehan diay sa inyong automation sa inyong form creation, kay unsay akong gibutang sa tracker is automatically automated na?
- **Student 1:** Mhm. Everything.
- **Student 2:** Cross-reference with the...
- **Adviser:** Except ani nilang kanang mga...
- **Student 1:** Okay, wala man na siya...
- **Adviser:** ...naa diri sa mga submission.
- **Student 1:** Mhm. Wala man. These are...
- **Adviser:** Oh pero, unsa may pamaagi nga pwede pa nang i-automate? Kay I can always adjust the source document man, maybe the tracker or the class record. Para kung automated man na, automate na lang tanan. Unsa may kinahanglan ninyong source nga reference?
- **Student 1:** Oh, that would be kuan... Actually, kani special ni siya kay kadtong lima man to in one deliverable.
- **Adviser:** Gani. Kuan pwede man ko moingon didto: "MVP Validation", butangan natog 1, 2, 3, 4, 5 didto sa ato nga cell. Para mao nay inyong basehan nga kung naay numbers didto, nagpasabot multiple ni nga submissions or multiple ni nga resources ang i-submit.
- **Student 1:** Mhm. I still...
- **Adviser:** So unsaon nimo pag... Sa pagpananglit na ang source sa inyong automation kay ang tracker. So initially ang inyong assumption, kung nakabutang didto kay one column ra unya usa ra ka title didto: "MVP Validation", inyong initial assumption kay usa ra diay siya ka buok i-submit?
- **Student 1:** One deliverable. Oo.
- **Adviser:** Unya usa pa ko mag-customize?
- **Student 1:** Oo. Mao.
- **Adviser:** So kung ganahan kag purely automated, pwede man gud ang source daan, didto na gi-specify...
- **Student 2:** Pila ka submission.
- **Adviser:** Pila ka submissions.
- **Student 1:** Mao ba kaha na, sir?
- **Adviser:** Mao gani. Unsa may kinahanglan requirement ba para ma-automate...
- **Student 1:** Para ma-automate, unsay ibutang nimo sa imong tracker. Ana?
- **Adviser:** Whatever. Unsay source nga document, maybe the tracker or class record.
- **Student 1:** So, a way nga i-automate na nimo kani siyang MVP validation...
- **Adviser:** Pati nang kuan... Pati nang dili man kinahanglan kana may source. I could have another sheet of deliverables.
- **Student 1:** Ah kana! That's better. That would be better.
- **Adviser:** I could create what are the fields nga akong kinahanglan. Moingon ko nga...
- **Student 1:** Ma-track na namo sir, kung...
- **Adviser:** ...moingon ko nga ID number should be a dropdown ID number, kay I don't want ID numbers to be entered. Or pareha... Example ana ha, pwede na ninyo ma-validate ninyo. So from that sheet nga naa dihang instruction, unsaon pag-describe sa field ba, unya how would it look like in the form.
- **Student 1:** Actually sir...
- **Adviser:** Mao nay inyong gibasehan sa automation.
- **Student 1:** Kuan sir, kung maghimo ka ana sir, magdepende kuan... bisag unsa nga kuan kay mo-adapt ra man mi.
- **Adviser:** Unsa may inyong gibasehan? Kay non-existent naman na, once mo-exist na inyoha. Di na man ko magbuhat ug tracker kay naa naman na inyoha. This is my tracker man. Why would I create another one like this nga I will be using your tracker na?
- **Student 1:** Okay. Good point. So if you're... Okay, we haven't thought that far. So if imoha na gyung gamiton ang among system, di na ka kinahanglan mag-Sheets?
- **Adviser:** Oo. So we can agree... We can agree on the configuration ba, the input ba: How do I prepare my input data para sa inyong forms, kabalo pa inyong kinahanglanon para sa inyong automation?
- **Student 1:** Ikaw sir, kay pwede ra man gyud nga in-ani nga mag-import ug way, or you can... mag-add mig system, entirely new system nga look, dira na ka sa in-app na ka maghimo sa kuan. It would take a while, but... It's a new system, new feature nga sa in-app na ka maghimo sa imong in-ani.
- **Adviser:** So ako na hinuoy mosunod ninyo karon?
- **Student 1:** Dili! Niana na mi daan nga it would be a new kuan, mura siyag kanang scope creep ba. Kay mao man ni atong sauna atong giistoryahan, gibasehan nga imong Sheets ang source of truth. Pero karon kung ganahan ka ana nga kuan... we can...
- **Adviser:** No, wait. Still Sheets. Sheets gihapon.
- **Student 1:** Sheets gihapon?
- **Adviser:** Sheets gihapon. Pero what I'm saying nga this sheet nga inyong gigamit is irrelevant. Kay that's the tracker sheet. You are creating a tracker. So why would I create a tracker sheet if there's already a tracker?
- **Student 1:** Ahh.
- **Adviser:** So kung class record sad, dili pud siya enough. Kay ang class record is just a list of students, sections, ug uban pa. Pero when it comes to automating the form, there are other details nga you need man.
- **Student 1:** Mhm.
- **Adviser:** So how would you like that information, still in a sheet form, be given to you? Ganahan mo ug in-ana na lang?
- **Student 1:** If kuan sir, unsa may kuan nimo sir, easiest way for you to...
- **Adviser:** Wa ko kabalo unsay easiest way... That's a new form man anyway. I'm going to create man sad it anyway. Kung moingon ba ko nga, "Ganahan kog spoken na kana."
- **Student 1:** That'd be a really expensive kuan.
- **Adviser:** So give me options.
- **Student 1:** Okay. So mopresent ameg options nimo to create kuan. Pero as of now, are you fine with this system nga mag-create sa kag form... I mean Sheets?
- **Adviser:** Kay kani atong gibuhat karon kay validation man ni no?
- **Student 1:** Mhm, validation pa man.
- **Adviser:** Validate... beneficiary and user...
- **Student 1:** Yes, sir.
- **Adviser:** ...as well. So mao nay... If you find these comments relevant nga feedback...
- **Student 1:** Yes, sir.
- **Adviser:** ...it's something nga pwede ninyong i-report atong deliverable nga inyong ipa-submit last Saturday pa.
- **Student 1:** Mhm. Wala pa mi nihimog kuan kay...
- **Adviser:** Right? Mao na inyong...
- **Student 1:** ...data nga gi-collect ba? Oo, mao gani.

---

### Part 02: Form Creation, Google Forms vs Custom Forms, and Authentication Security
*File: `TRANSCRIPT_part-02.mp3` | Duration: 08:06*

- **Adviser:** Pero dili ba kinahanglan sulbaron dayon diha-diha dayon. Nakita pero at least inyong masabtan unsa may points of dilemma ba.
- **Student 1:** Mhm.
- **Adviser:** Unya you offer options later mas efficient, mas timely.
- **Student 1:** Okay.
- **Adviser:** And at the end of the day, ang kuan man gud nimo ana sir...
- **Student 2:** Lagi, ang pag...
- **Adviser:** Oo, pero I am relying nga I would know everything what you're doing. Unya I would kanang easily ba...
- **Student 2:** Kuan gyud hinuon.
- **Adviser:** Oo, connect lang to whatever you're doing. I'm not even familiar unsa na pag-automate sa form. Kay kung opinyon ninyo, opinyon nako inyong gibuhat, ako nang gibase kung unsay akong na-experience gud. And I'm used to creating forms using Google Forms. That's what I'm used to. Pero kung ingnon ko nga, "Pagbuhat lang, kinarahaan lang sad nga form," and that might be... Mura ra mog... "Sige man imoy ganahan, kamo ray kapoyon og automate."
- *(Laughter)*
- **Adviser:** Mao na na-defeat na nuon ang purpose to explore ba kung unsay mga better nga option.
- **Student 1:** So mohatag mi nimo kuan... options to... Okay, so regarding sa kani sir, unsay mga kuan... what... what... unsay tawag ani, unsay may mga part sa among system run nga naa kay opinyon nga kuan aside from katong...
- **Adviser:** Kaniadto, in particular, kadto rang automation of the form.
- **Student 1:** Okay.
- **Adviser:** Kay you specifically mentioned ba nga automated na siya. And I can see gamay ra ang legroom for pag-maneuver sa sulod sa form ba.
- **Student 1:** So...
- **Adviser:** So kanang kung familiarity lang, usability lang para sa akoa nga side, it would have been siguro familiar na sa akoa kung pina-Google Forms siya, pag-assemble sa form itself, then you automate everything...
- **Student 1:** Ah, so like mura syag full page in-app kuan gyud?
- **Adviser:** That might be too much.
- **Student 1:** Not really, no. It's easily kuan...
- **Adviser:** Kaya ninyo na? In a form...
- **Student 1:** Kaya. Naa na may kuan, igo ra kopyahon sa...
- **Adviser:** Open na Google Form, create of new form, ana?
- **Student 1:** Kanang blank form, ana? Kaya na nina tanan?
- **Student 2:** Add question...
- **Adviser:** Unsay kuan, unsay kanang relevant? That's the familiar. To me, mao na akong familiar environment. I can add easily a field, I can specify how would I capture the data: dropdown ba, open-ended ba ning pangutana, list ba ni siya, taas ba ni nga paragraph.
- **Student 1:** Okay. So this one, alongside our automation...
- **Adviser:** I'm not saying... You're asking me man.
- **Student 1:** Oo, we are, yes. It is doable, sir.
- **Adviser:** Ang kuan sir, naa sad mi mga questions... Unsa to tayong mga questions? Ah, about sa pag-connect sa record sa student. As of now, naa kay student account dira?
- **Adviser:** Student account? Naa.
- **Student 1:** Class record sa student. Kay mo-detect man ang system sa mga kuan, unsay mga IDs sa students, and kuan. As of now, mo-log in ra sila, unya mo-connect ra sila... mo-search ra sila sa ilang record unya mo-connect dayon na. So naa say pwede sad nay laing tawo mo-connect sa the same record. Mao tong system namo nga mo-detect ug kanang identity, kanang naay duha... kani nga student record naay duha ka Gmail na-connect, unya mao na na. Pero para ma-lessen ang kanang in-ana nga kontak ba kay... unsa may... Unsa may ganahan nga system nimo nga kuan sir, mag-OTP ba? We agreed that OTP is like too much na kaayo ang kuan ba, ang... Unsay tawag ani?
- **Student 2:** Disconnect.
- **Adviser:** So unsa... unsa may problema sa Google nga authentication?
- **Student 1:** Dili kay... Wala. Inig ka log in ana nimo, connect ra ka, log in ka, student number...
- **Student 2:** Okay, mao man ni atong giingon sa iyaha nga mag-input kag email, mangita ka sa imong ID number, then inig connect na nimo...
- **Student 1:** Ana, makita na nimo.
- **Student 2:** Lapos na man, lapos.
- **Student 1:** Wala na, wala nay OTP, wala na tanan.
- **Adviser:** So I can search any ID number?
- **Student 1:** Oo.
- **Adviser:** That's not secure.
- **Student 1:** Yeah. So we were talking about... We were talking about possible ways nga low friction nga security. Or like full gyud nga kuan nga kana, ang way ana... Unsa man, OTP? OTP ra koy nahibaw-an nga ma-secure gyud. Mo-OTP ang student sa ilang Gmail unya...
- **Adviser:** Para asa diay ang OTP?
- **Student 1:** Para...
- **Student 2:** Pag-connect sa student record.
- **Student 1:** Pag-kuan nimo, paghimo ug kanang... Mo-log in kag Gmail, unsa na? Mo-send kag deliverable, mo-log in ra ka, log in Gmail, nothing. You don't have to do OTP and stuff. Maka-send ra ka, you can input your name, student, blah blah blah, and then mo-reflect ra na sa kuan, sa nga mao ni, kani nga student, mao ni nisend. Pero if you want to see your... your kani... kanang imong...
- **Student 2:** Mga student information...
- **Student 1:** Imong information... kay kato to, mo-connect kag...
- **Student 2:** Mo-connect ka sa record.
- **Adviser:** So diha i-OTP? Kung tan-awon nako akong record?
- **Student 1:** If... Oo, if OTP. Pero among gihuna-huna sad nga pwede ra ba nga... Unsa na, parehas sa GCash nga itago ang last three numbers sa kuan...
- **Student 2:** Sa imong ID number.
- **Student 1:** ID number, unya i-input nimo manually, unya name sad nimo i-input manually para maka-connect ka.
- **Adviser:** Actually, inyoha nang problema nga sulbaron, dili akoa. But make it secure. Do not violate any data privacy nga...
- **Student 1:** As long as it doesn't violate, okay.
- **Adviser:** That's a violation of data privacy. I can search any ID number. I can type an ID number, kabalo nako unsa imong status.
- **Student 1:** But technically, mao ra gihapon na sa tracker nimo, sir.
- **Adviser:** You are not associating my Google account with the class record man nga data.
- **Student 1:** But the thing is, kani sir, ang data diri sir, kanang makita nimo tanan data diri, makita ra sad nimo sa tracker, actually. Ang data makita nimo diri is...
- **Adviser:** Mao gani nagbuhat tag different ka tracker kay the tracker currently is a data violation.
- **Student 1:** Ah, so your system currently is a data...
- **Student 2:** Paspas lang ta, paspas lang natog OTP sa.
- **Student 1:** Mag-OTP na lang ta sa...
- **Student 2:** O, unya mangayo tag feedback sa mga tawo if kuan...
- **Student 1:** Kay it's an extra feature man, di ba?
- **Student 2:** Abi sa pa, security man na.
- **Student 1:** Security man sad.
- **Adviser:** Pero explore other options ha, kay I've seen other groups nga similar nga naay similarity, they find other ways to secure data.
- **Student 1:** Without friction.
- **Adviser:** Kay imoha, i-authenticate nimo sa Google to access the data.
- **Student 1:** Oo.
- **Adviser:** What if you go a step further? I-authenticate nimo iyahang Google, and you associate that authenticated Google account...

---

### Part 03: Student Account Association, Google Auth vs OTP, and SMART Goals Framework
*File: `TRANSCRIPT_part-03.mp3` | Duration: 08:06*

- **Adviser:** ...to a specific record in the class record. So you are limiting lang to that record, meaning he cannot see everything in the class record, only one row. You don't need OTP. OTP is... UX issue.
- **Student 1:** Kay pwede in-ana, pero maka-kuan man sila gud... What if this Gmail account... Kay... Unsa na? Are you thinking nga ma-lock sa usa... ang usa ka Gmail sa usa ka kuan?
- **Adviser:** Associate nimo ang Gmail sa usa ka student sa class record.
- **Student 1:** Oo gani, so what if sayop na sayop nila atong first time, ma-deassociate nimo siya? Kanang in-ana?
- **Adviser:** Why would you, by the way...
- **Student 1:** Mao gani, mao ni sir...
- **Adviser:** ...to fix the association? If you forgot your... If you have plenty of Gmail, it's your problem kung which Gmail imong gigamit associated with the class record. So you only pick one Gmail account associated to a record. You cannot associate multiple Gmail to one record.
- **Student 1:** Yeah, as of now, that's how it currently works.
- **Student 2:** So di diay to...
- **Student 1:** Mao lagi.
- **Student 2:** Di to mao to katong kang sir ba, identity history? Didto sa iyang forms nga usa ra ka Gmail like pag mo-submit ka sa kuan, bisan sa link ni sir pero lahi nga Gmail, mura’g di na mo-reflect.
- **Student 1:** Bitaw.
- **Student 2:** Sa kang sir?
- **Student 1:** Ah, so ang first nga Gmail nga gigamit to submit, mao na nay na-associate?
- **Student 2:** Kay di ba kabantay ka if mag-submit ka sa katong kuan, katong for example katong atong document sa past kay i-edit na lang...
- **Student 1:** Mhm.
- **Student 2:** ...unya magkuan ka sa uban subject, unya bahalag pareha nga kuan imong gibutang...
- **Student 1:** Sa in-ana nga way diay, no? Sa Gmail, oo.
- **Adviser:** Why should that be my problem? Nganong diay giguba ninyo?
- **Student 1:** Kana na lang, kay kuan man gud sir kay lagi... we're thinking of edge cases unya...
- **Student 2:** Apil man to sa submission, mao man to sa class record.
- **Student 1:** Sa submission nuon, oo. So kung mo-log in kag laing Gmail, mo-use ka sa imong details unya mo-send kag deliverable, dili mo-reflect sa tracker?
- **Student 2:** Oo.
- **Student 1:** First-come, first-served basis lagi ang association. So if first-come, first-served basis na lang ang association, okay na.
- **Adviser:** Open gyud to whatever initial configuration nga inyong gi-require just to make sure ba nga safe and secure siya.
- **Student 1:** Mhm.
- **Adviser:** To tell you, usa sa approach nga gibuhat sa usa ka group before, sa sulod sa class record... Kay gipangayuan daan ug Gmail ang kada estudyante.
- **Student 1:** Ahh. Samok na nuon. We were thinking about that, pero like samokon na sad nato si sir, unya low-friction...
- **Adviser:** Well, that's an example of a strict association. Kay that's part of the row man, the data. If wala na nag-match nga Gmail, then you are using the wrong Gmail, it's your problem.
- **Student 1:** Mao gani, sir.
- **Adviser:** In the first place, ngano ako pay nag-type sa inyong Gmail? Unsay inyong gamiton nga Gmail account? Just like kanang sa team formation ba, mangayo kog data about the team.
- **Student 1:** Okay, but you're not open to doing that right this one right now?
- **Adviser:** That's an approach. I'm saying again, whatever preparation ba or configuration you think that needs to be done para lang safe, secure ang system, open ko ana.
- **Student 1:** Okay. So amoa sad sir kay... Sa among research sad sir, we're talking about that one, unsay among gamiton nga kuan sir kay ISO nga framework?
- **Adviser:** Balik mo sa inyong SMART goals. Unsa may inyong SMART goals?
- **Student 1:** Kay among kuan man to sir, if you remember katong sir nga last... one week naman mi ato, so that... katong system among gi-build, that was without your guidance. Katonang this current MVP, kato ni sa summer. So a lot has changed.
- **Adviser:** But what did you propose? Unsa may proposal?
- **Student 1:** Kato...
- **Adviser:** I-revisit to ninyo.
- **Student 1:** Revisit to namo.
- **Adviser:** Base atong SMART goal, diha ninyo ibase unsay framework.
- **Student 1:** But we can change the SMART goals, no?
- **Adviser:** Pwede siyang mausab base sa...
- **Student 1:** Base sa current build.
- **Adviser:** Oo.
- **Student 1:** Okay, so we... amo lang siya i-build upon sa previous nga SMART goals. Unya... pero kani among kuan sir, napili nga framework...
- **Adviser:** Dili gyud... dili framework first unya usa pa ninyo tan-awon ang SMART goal. Sunod gyud ang SMART goal, unya framework sunod. Ang purpose gyud pag-require sa inyuha pagpili ug framework para ma-customize ninyo ang instrument ba, questionnaire nga inyong gamiton based gyud on the framework nga acceptable. Kay ultimately ang goal, makabuhat kag instrument para maka-collect kag data para ma-evaluate nimo or ma-analyze to check kung kato bang imong SMART goal na-achieve ba or wala. So kung moingon ka nga kanang ang mo-AI is 95% accuracy, unsay framework dapat inyong gamiton ana? Ang accuracy man inyong gi-measure.
- **Student 1:** Sa atoang SMART goals, atoang gi-measure kay...
- **Adviser:** Sige daw bi. Unsa man nga framework?
- **Student 1:** We build naman sa kuan, sa katong current nga kuan... Unsay SMART goal? Unya ang napili namo ato sir, based sa revised namo nga SMART goal nga built on top kay kani, kani'ng ISO supported by SUS.
- **Adviser:** Unaha sa... SMART goal. Pwede ra na i-feed ninyo sa AI tanan. I-analyze ninyo inyong SMART goal, hatag na ni GPT ang inyong proposal, unya ingna si GPT: "Pangitaig angay ug appropriate nga framework nga mo-answer ani nga goal, buhati kog questionaire."
- **Student 1:** Our current SMART goal kay student submission effectiveness, based sa among karaan nga kuan, unya submission and status...
- **Adviser:** Submission effectiveness? Unsay measurement ana?
- **Student 1:** "Complete their assigned deliverable submission workflow using a valid link without a facilitator completing steps for them."
- **Adviser:** So mura nag user experience?
- **Student 1:** Mhm. Oo. Yeah, submission and status clarity...
- **Adviser:** Dali ra man na siya ma-solve.
- **Student 2:** Oo.
- **Adviser:** Dili... Base sa akong comment gyud during the proposal no, kay kanang mga usability nga measurement ba, kay assumed naman na nga naa. Unya assumed sad na siya nga acceptable gyud. So ang framework gyud for usability kay ang SUS. Acceptable nga score ni SUS kay 80. So ato nang gi-assume, whether nag-SUS mo or wala, 80 gyud score ana. So di na kinahanglan ibutang sa objective ba nga ganahan mi mo-achieve ug 80% nga SUS score, kay that's assumed to be 80 then. So kung usability lang, dili na nato na i-measure kay you've been doing that since HCI. Kabalo na mo how to create a...

---

### Part 04: Usability Measurement vs AI Evaluation, and Document Verification Checks
*File: `TRANSCRIPT_part-04.mp3` | Duration: 08:06*

- **Adviser:** ...user-friendly nga submission. You don't have to measure that anymore. So for sa akoa kay you have AI there, focus on a measurement on the AI.
- **Student 1:** Speaking of sad sir, naa sad mi pangutana sir. Ang... unsa ni? Ang current nga Document Check nga kuan, kay dili pa gyud mi sure. Actually...
- **Adviser:** Kana is another, the checking of the...
- **Student 1:** Yeah.
- **Adviser:** ...truthfulness of the document submitted. It's a good...
- **Student 1:** Yeah, this one, this is actually... they did not ask.
- **Adviser:** ...parameter to measure.
- **Student 1:** As of now, kaning Document Check is kani mura ra nig kaning sa mga artifact, sir: kanang drive access, download, integrity, readable text... Kani siya sir, is this like kuan, usable? I mean useful to you kung basahon nimo?
- **Adviser:** Kung naa na before, useful na para sa akoa. Unsa man, example?
- **Student 1:** For example, access...
- **Student 2:** Drive access, so wala siya gi-restrict.
- **Adviser:** Of course, it's very useful. Dili na diay nako na dawaton?
- **Student 2:** Yeah, download is allowed, so pwede ra ka maka-download sa link. PDF integrity means nga dili siya corrupted nga file.
- **Adviser:** Useful na.
- **Student 2:** Readable text, so pila ka characters...
- **Student 1:** Characters sa text, kind of...
- **Adviser:** Useful na kaayo.
- **Student 2:** File type is PDF, file size...
- **Student 1:** Kind of redundant, but still...
- **Adviser:** Useful na! Kaysa tagaan kog mga gig of video!
- *(Laughter)*
- **Student 1:** Actually, dili mo-accept ang system, dili mo-accept ug like certain file size...
- **Adviser:** Gig of video unya gi-edit ang extension, gi-.pdf!
- **Student 1:** Dili naman ma-edit... No, we did... You did your katong giingon nimo sir nga sa forms pa lang daan, mo-check siya ba nga kani nga link kay shared na ba siya or accessible. So kind of kani siya, kind of redundant na siya kay from the forms itself, di naman siya mo-accept kung dili siya readable or dili siya accessible.
- **Student 2:** Double check ba.
- **Adviser:** Ah, wa diha kay kinsay author?
- **Student 1:** Oh yes! The author thing, yes! Ang author kay associated naman na sa kuan, di ba?
- **Adviser:** Kinsa diay author? Recorded diay na kinsay last nimo gi-edit?
- **Student 2:** Naa nay drive modified nga date of time, pero wala ang author.
- **Student 1:** But not the author. Okay. Naa ra man sad...
- **Adviser:** So balik ana, if we are going to make that as one of the SMART goals, unsa pa may... Unsa pa may unclear diha?
- **Student 1:** Kuha ra na tanan?
- **Student 2:** Kani kay legit gyud ni nga accurate kay gikan man gyud ni sa metadata.
- **Student 1:** Ang dili... Ang kuan akoa ani kay ang Official Template Comparison. Mao ni akong pangutana nimo kay the whole template thing, I don't know if every kuan niana nimo sir...
- **Adviser:** AI may nagbuhat ana?
- **Student 1:** No, yours! Katong di ba naa may...
- **Adviser:** Comparison ba?
- **Student 1:** This one, that... kani nga Document Check. Mao nang niingon ko nga redundant kay the AI is supposed to do this sad. Just check the headers and stuff, pero dili man gyud na kuan... basin masayop ang kuan...
- **Adviser:** So ang... Dili lang na about the template, pero about gyud sa... sulod mismo. Kay basin gitagaan kog template unya blah-blah-blah ra nang gibutang.
- **Student 1:** Mhm. No, no, no, the content itself. But I'm gonna ask if like is this redundant na ba? If redundant na ba kay ang AI review does the same thing, it checks for the header. So we are gonna ask if we should we just remove this na lang? Kay kani is file validation naman ta.
- **Student 2:** Kind of redundant... double checking.
- **Student 1:** Remembering, butang na lang natong author. Author na lang kulang lagi. If mag... atong himuon ni natog kanang SMART goal if we're gonna pass if we remove this...
- **Student 2:** If it's SMART goal, measurable...
- **Student 1:** Kana.
- **Adviser:** Currently, I'm... I'm not 50% yet, so yeah, pasar.
- **Student 2:** Ang apol lang kay kani is good naman para nako. I mean, it's missing the one parameter, pero okay naman ni siya, kani lang.
- **Student 1:** Mao gani. This one, I have to fix this kay ang schema... I'm trying to fix this kanang... Kani man gud siya, open-ended siya nga JSON, it does not check for specific... It's supposed to check for specific files. It was supposed to check for uploaded kuan...
- **Student 2:** Pero di siya...
- **Student 1:** No, that's fine. I didn't put man... There's no field for it. Right now I did, wala pa nako na-update sa GitHub... I didn't merge it yet. So akoa sir, ang question namo sir kay as of now, ang AI review... Listen, go back sir, AI review. It checks kuan, kaning flags... Ang prompt ani kay... I believe akong gi-send... Ang prompt nga isend sa Gemini...
- **Adviser:** Sa submission ba na?
- **Student 1:** Oo, submission.
- **Student 2:** Submission ni. Naa nay AI review sa side sa kuan...
- **Student 1:** Ang i-check sa prompt ani specifically for unsay i-check sa AI kay... unsa to? Deliverable requirements ug ang official template. So basahon... unta basahon if naay template, basahon to siya and i-compare if na-fit ba siya... na-fit ba, naa ba gyud to syang header unya sakto ba, naay flags. Mao ni flags: "and I'm missing a week nga section", kani unsay naa, unya also suggested action: "submitted documents... kani kay lahi man ni, SPMP ang deliverable akong gisend kay problem exploration. So ang giingon kay: 'submitted document is an individual problem exploration report, not a refactored SPMP. Please resubmit the correct deliverable following the required SPMP structure.'" As of now, ang kuan ta ani sir, mo-check unta siya sa official nga template and it should not kanang hallucinate... kanang kani mga headers, unsay mga naa. As of now it is doing that because naa koy gi-fix karon nga ibutang pero wa pa nako na-merge sa main. So supposedly ma-fix ta ani, kaning kuan... kaning awa: "sections such as project scope, schedule, blah-blah-blah..." Kani siya, it hallucinated this, niingon ra mig "such as". So supposedly wala gyud ni siya, ang prompt nako kay: "If wala, say be honest nga there's no template." So mao na among kuan sir. And kani siya, mao naman ni, mo-check naman siya sa headers unsay mga kuan, unsay mga need nga sections. So kaning template comparison diri, redundant na ni siya sir. So should we remove na lang this one, the offline? Ang focus na lang sa kaning Document Check kay kaning file validation.
- **Adviser:** So dili na na relevant diay, kanang AI?
- **Student 1:** Dili, kani! Dili relevant kay kani siya dili man siya accurate.
- **Adviser:** Unsa may tumong ngano gi-generate diay?
- **Student 1:** Kani? Maka-AI review all ka, or like individually...
- **Student 2:** Adto ka diri sa review...
- **Student 1:** Individually review.
- **Adviser:** Dili, para sa akoa, nindot kaayo... Kani gud akong gibuhat, gipangayoan nako og number. Pero ang purpose gud anang checking kay filtering man gud na siya. Kay pananglit, parehas sa imong giingon: ang deliverable kay SRS, unya gisudlan nimo og SPMP. So kung kuhaon nimo tong comparison, that means dawaton na lang akong SPMP for an SRS nga deliverable?
- **Student 1:** If mag-Document Check ra imong tan-awon?
- **Adviser:** Dili, kuhaon to ang comparison, ingon nimo irrelevant ang comparison.
- **Student 1:** Ah dili...

---

### Part 05: Template Comparison, Content Truthfulness, and Drive Metadata Tracking
*File: `TRANSCRIPT_part-05.mp3` | Duration: 08:06*

- **Adviser:** So modawat ka og irrelevant nga document for a particular deliverable? Moingon kog STD, naa koy template didto, gisudlan hinuon kag SRS...
- **Student 2:** Dawaton na lang ba?
- **Student 1:** Dili, dili madawat. Dili man siya kuan...
- **Adviser:** Relevant to ang comparison?
- **Student 2:** Kay what if kani ang ngalan ba, unya ang sulod...
- **Student 1:** Ah, the name of the kuan, sa content?
- **Student 2:** Oo.
- **Student 1:** Mao gani, so ang kuan man gud ani kay dili lagi siya 100% accurate, or like not even, I'm not even sure if maabot nig 90. Pero if kuan ra, if i-compare ang name sa file sa kuan, name sa file versus the name of the deliverable, yeah we can do that, but...
- **Adviser:** It's not about the name, it's about the content itself.
- **Student 1:** Content itself? Mao gani.
- **Adviser:** Kay pwede man nako... Kanang SRS ang sulod, unya giingnan nakog SPMP ang file name. Pwede man.
- **Student 1:** Mhm. Pwede gyud.
- **Adviser:** Mutoho ka sa file name?
- **Student 1:** So mao gani, mao may gamit sa AI review unta.
- **Adviser:** Dili, ang imong pangutana kaniadto... I-close daw na.
- **Student 1:** Okay.
- **Adviser:** Ah kani oh, kani.
- **Student 1:** Kana?
- **Adviser:** Kaning comparison, ngano man ka irrelevant na siya? So ang akong tubag: para sa akoa, mas relevant pa ni kaysa ana.
- **Student 1:** Mhm.
- **Student 2:** Kuan ba diay ni...
- **Adviser:** Wa man ko niingon gradohi ang document, or i-examine kung correct ba ang gibutang or wala.
- **Student 1:** It does that, with the flags.
- **Adviser:** Kay naa may laing project naghimo ana.
- **Student 1:** Aw lagi, mao to sila.
- **Adviser:** Naay SPMP checker, SRS checker, proposal checker... Nasulod na na!
- **Student 2:** So naa na diay.
- **Adviser:** Pero ang mo-evaluate kung truthful ba or honest ang file nga gi-submit, inyoha nang trabaho.
- **Student 1:** Okay, so we will just... As of now, kani padayon na lang, padayon na lang ni namo pero i-revamp lang ni.
- **Adviser:** Careful mo ana kay naay scenario: kay sabtan ko og tinuod nga SRS, ang template nag-submit way sulod. Unya imong dawaton? Para sa akoa, di nako na dawaton.
- **Student 1:** Mao gani sir, pero ang kuan ana sir, as of now, how the system works, di pod na ma-track. Kay ang header ra may i-track sir, so ang content itself, dili siya mabasa sa kani.
- **Adviser:** Nganong di man nimo basahon?
- **Student 2:** Makakita siya sa content ba kung blanko ba siya. Naay template, sakto ang template, pero way sulod.
- **Student 1:** No, kataw-anay... Ang...
- **Student 1:** Okay, so unsay tawag ana, mapareha gani, i-check like same ang characters ba sa kani, like ang characters sa gisend nga file ug characters nga sa template kay mapareha, unya butangan ug kanang... unsa gani nang score gani, similarity score? Kana! Mao na atong kuan sa system.
- **Student 2:** Aydili, kay matik naman na kay kung nisunod syas template, matik ang headers pareha ra.
- **Student 1:** Mao gani, so...
- **Adviser:** So di... Sa ana nga point, ang likelihood ra na nga official, pero we're not guaranteeing nga...
- **Student 1:** Ang content na-change.
- **Adviser:** ...ang ilahang gi-input. Kay posible man naay template, ni-follow sa template, unya ang kada section gihimog blah-blah-blah, blah-blah-blah. Di pud na nimo dawaton, kay blah-blah-blah ra.
- **Student 1:** So, okay.
- **Student 2:** So kailangan nato pamaagi nga makita gyud nato.
- **Adviser:** Ang context ba.
- **Student 1:** Ang likelihood lagi, kuan diha...
- **Adviser:** Ang context, unsa may labot gyud ani? Introduction, unsa may labot gyud ani?
- **Student 1:** SMART goals na nato.
- **Student 2:** So mao na na next...
- **Student 1:** Likelihood nga sa kuan ba...
- **Student 2:** Nga accurate nga...
- **Student 1:** Most of the time.
- **Student 2:** Most of the time.
- **Adviser:** Gitawag ug filter naman gud na. Ato naman nang gi-filter daan. So in-ani gyud na ang... In-ani gyud na ang mga... I'm not saying mao ni inyong gibuhat, pero in-ani gyud na ang focus-focus nga gipanghimo sa mga manabiay: submission kog template para lang dili mamarkahan nga late.
- **Student 1:** Late lagi. Mao na ilaha.
- **Adviser:** Bakante nga template, unya hoping nga di nako maabtan. Unya ilaha rang i-edit ugma. Paspasay og edit para di mabantayan nga empty diay to unay gisubmit.
- **Student 2:** Mao na nuon.
- **Student 1:** Di ba maka-change ba kag kuan... maka-change... Ay, kay naa nang paagi sir nga mo-send kag link sa PDF... PDF diay gisen or docs?
- **Adviser:** Link sa document nga naa sa Drive.
- **Student 1:** Oo, document. Di man editable ang Drive, ang PDF ata, pero I think naay way nga upload nimog link kay mailisan nimo ang content sa PDF.
- **Student 2:** Pwede na, ang version. Ang loop hole man gud ana kay igo ra link ang isubmit ngadto.
- **Student 1:** Oo.
- **Student 2:** Pwede ra man nila ma-edit.
- **Student 1:** Mao gani, ma-edit ra nila sulod gani. Kani...
- **Adviser:** Pero ma-usab na. Pero hibaw-an nako nga maadto ug tan-awon nako kada file, bisitahon sa inyong Drive, unya ako pa nang i-right click, tan-awon nako ang details kanus-a ni gi-edit?
- **Student 1:** So kani ang kuan na ni, ang... unsa may tawag ani, tracker kay magdepende sa Drive modified and/or if gi-resubmit ba nila sa link. Kana. Isn't that much better? Kay even if makabantay pa sila, ma-edit pa nilang kuan, ma-late gihapon sila kay ma-Drive modified man, mailisan man ang date.
- **Adviser:** So sa tracker, you can even present it much better than I did, or whatever I did ba in my tracker. Kay I only capture the date submitted. Pero pwede man na nimo madetalye since individualized naman. So moingon kag SRS, naka-lima ka version na ni.
- **Student 1:** Ah, yeah.
- **Adviser:** Kani nga mga tawhana mao ni nag-submit, mao ni mga date sa submission. So tracker gyud siya of whatever changes nga imohang gibuhat of that document ba.
- **Student 1:** Mhm. That specific document.
- **Adviser:** Tanan makita man na nimo from Google.
- **Student 1:** So naay edit history?
- **Adviser:** Gamita’s API.
- **Student 1:** So sa kuan na sir, student dashboard?
- **Adviser:** For every student.
- **Student 1:** Kay sila ray maka-access sa ilang edit history.
- **Student 2:** Mao na na sir. Instead nga link ra ang mura’g ma-detect nga gi-modify, ang content sa sulod inside that link.
- **Adviser:** By the way, naa man sa inyong personal nga Google Drive, wa man koy control ana. Pero what I can do is I can extract the metadata ba of the changes made to that file.
- **Student 1:** Mhm, by who.
- **Adviser:** Si Google API naa na, naay access. For sure naa na. Kabalo gyud si Google kapila na gi-edit, kanus-a ang last siya gi-edit, kanus-a siya gi-create. Naa man na nga data: kanus-a created, unya kanus-a last edited.
- **Student 1:** Okay. So ang kuan ani sir, naay go signal for the... maghimo pa ba forms? Like gikan nimo ang go signal?
- **Adviser:** Dili kani, ang deliverable last Saturday kay validation man gud nga feedback.
- **Student 1:** Mao gani, wala pa mi...
- **Adviser:** Away di kani...
- **Student 1:** We ran to you.
- **Adviser:** Kani ba, example of validation na?
- **Student 1:** Oo. Pwede na ipagawas namo...

---

### Part 06: Form Roles, User vs Admin Perspectives, and Google Sheets Testing & Writeback
*File: `TRANSCRIPT_part-06.mp3` | Duration: 08:06*

- **Adviser:** 14 weeks siguro kung wa gi-announce. Pag-check nako wa gi-activate ang link.
- **Student 1:** Lagi. So...
- **Adviser:** Pero that has been announced.
- **Student 1:** Okay na mi sir, makahimo na mig kuan, maka-propagate na mi sa forms?
- **Adviser:** Kung in-ana ra pud permi ang imong ipakita, probably receive the same feedback so what's the point?
- **Student 1:** Oh, after changes.
- **Student 2:** After the changes.
- **Student 1:** After the changes. From currently, right now we do the changes and then we change the SMART goals namo. Mobalik pa mi nimo sir, or go na mi kay late naman?
- **Adviser:** Dili man kinahanglan. Pwede man mo...
- **Student 1:** Sige, sige na to.
- **Adviser:** Makita man nako nagbalik. Basta ang danger diha if you... Well, speaking from a teacher, adviser ba, at the same time potential nga beneficiary ug user, kadto nga inputs nga akong gi-share karon, sagol-sagol na to. Naa toy from the user nga perspective, naa toy from...
- **Student 1:** Beneficiary.
- **Adviser:** ...what I wanted to see as an output ba. Kanang moingon kog: "Kanang security, inyoha nang problema." That's from a teacher comment, dili na from a user. Pero katong user experience nga mangutana kag, "Unsay imong ganahan, gi-automate na among form? Ganahan ba kag in-ana?" Unya moingon ko nga, "Kaya ba ninyo? Ang Google Form inyong i-replicate ang experience sa Google Form?" Pero I'm not saying nga buhata. So from a user to, dili na from a teacher perspective. Wa man ko nag-demand. Pero if I were the user, speaking from a familiarity nga perspective, I'm more familiar with Google Forms.
- **Student 2:** Mas pabor gyud hinuon kato.
- **Adviser:** Oo. So ang UX ato nga part, not the teacher nga part.
- **Student 2:** So sa kuan pod diay to sir, since regarding sa forms, makaingon man ta nga tulo kabuok klase nga users: students, teachers, and also ikaw nga admin. So we can say nga magbuhat mig... pwede mi magbuhat ug lahi-lahi nga forms for each kuan since lahi-lahi man silag kuan...
- **Adviser:** Pwede ra man sa usa.
- **Student 2:** Pwede ra man sa usa?
- **Adviser:** Sa usa ra man nga form.
- **Student 2:** If lahi ang role kay... Lahi man gud og form role.
- **Student 1:** Sa selector... Unsay imong kuan.
- **Adviser:** Since student man gud diay, user sa form, si teacher si creator.
- **Student 2:** But ang sa inyong side sir...
- **Adviser:** Creator man ko.
- **Student 2:** Admin, sir Musa?
- **Adviser:** Ako man no'ng... Sir Musa, form...
- **Student 1:** So mao na ni ato-a?
- **Student 2:** Oo.
- **Student 1:** Kuan na tanan, kani atong i-transcribe ta ni, ibutang ta ni sa unsay findings nato. Unya the rest na lang, 15 to 19, mao na lang atong pangitaan ug uban kay naa of course naay advisers, mangita pa tag advisers. So kani na lang kuan.
- **Student 2:** Oo, mao to.
- **Adviser:** So align kadtong paminaw nako ha, di ba three to atong gi-set nga minimum nga SMART goal, so sa akong nadunggan murag duha pa to inyong na-decide.
- **Student 1:** Nangita pa gyud bitaw mi.
- **Adviser:** Pero kamo nay bahala sa usa ha. Walay apil ihap ang SUS.
- **Student 1:** Walay apil ihap ang SUS. Walay apil ihap ang SUS.
- **Student 2:** Tulo.
- **Student 1:** Sige, sige.
- **Adviser:** Pero okay ra gyud mobalik sa akoa.
- **Student 1:** Ah sige sir.
- **Student 2:** Pero sa user testing, user testing mao ra gihapon sa Sheets ha?
- **Student 1:** Unsa man?
- **Student 2:** Testing-testing sa kuan ba. Testingan ba nato ang submissions, di ba? So let's make lain nga Google Sheet, of course kanang in-ani.
- **Student 1:** Nga diri?
- **Student 2:** Like mura’g kopya ani ba.
- **Student 1:** Mao gani. So we're making ang atong forms kay atong site, dili Google Forms.
- **Student 2:** Oo. So that's... that's an overhaul!
- **Student 1:** Para ma-testing sad nato. Mao gani, pero overhaul na na sa system, we need to make kuan ang backend ana.
- **Student 2:** Oh wait, no no no... Like ang pasabot kay like himo tag lain nga Sheets, mura’g in-ani.
- **Student 1:** Oo.
- **Student 2:** So it's a new workspace, di ba? Yeah, just to test.
- **Student 1:** Just to test kuan. But ang kuan kay atoang... Unsay tawag ani? So yeah, that's actually a good idea. Unya ang pag-propagate man gud...
- **Student 2:** Ang pag-propagate ani is not a problem.
- **Student 1:** I know, but ang data ba, we don't have a way to view really the data. We need to download everything ba. Makita nila... No, there's no way for us actually to see their kuan. Kana gung... Let's say kuan... Kaning unsa diay? Data ba! Ang... di ba once maka-answer na ang student ani sa submission form, di ba naa man nay kanang nindot nga unsa nay data makita nato sa kuan... for this specific nga... Kay mura ra ba ni atong makita as a backend. Kani, kani ra gyud!
- **Student 2:** Wala... We don't have...
- **Student 1:** We don't have a way to see good kuan ba, kanang unsay nakolekta nato ba nga kuan... Wala tay katong selection thingy, like multiple choice. We don't have... Mag-edit pa lagi ta balik. So no, maghimo pa ta atong form thingy, ganahan si sir. Like way to change the field to dropdown, field...
- **Student 2:** That is true.
- **Student 1:** So yeah, we just use kuan, as of now sa...
- **Student 2:** I mean, if that's the case, then just make a copy of this. Just make a copy of this, kay this is read-only man, di ba?
- **Student 1:** It is read-only.
- **Student 2:** And everything has to be stored at the end of the day sa Sheets.
- **Student 1:** So we kuan sa, katong unsa to?
- **Student 2:** Himo na lang tag copy ani and then...
- **Student 1:** Usaha na for the MVP workspace?
- **Student 2:** For the kuan...
- **Student 1:** Para maka-writeback ta?
- **Student 2:** Yeah, para ma-writeback nato ba nga...
- **Student 1:** Actually not really kuan, dili man kaayo need karon kay as of now it's working here. Look, unsa gani ni?
- **Student 2:** Look at this, it's run...
- **Student 1:** It's tracking itself, dili siya mo-writeback.
- **Student 2:** Unsaon man pag-gamit sa Sheets if...
- **Student 1:** Unsa may gamit sa Sheets kung... Wala pa man, kay MVP pa man ta.
- **Student 2:** Kina kuan... Galibog kog tracker diri, unya tracker pod sa system.
- **Student 1:** Mao gani.
- **Student 2:** So mas maayo kay at the end of the day, mao man gyud ning tracker.
- **Student 1:** Mao gani, so in the end of the day, kuan gyud...
- **Student 2:** Kani na gyud atong himuon og Sheet, kanang lain. And then mo-connect sa kanang nga Sheet so that submission links kay mogawas didto.
- **Student 1:** Ang submission links, unsa?
- **Student 2:** Ang submission links mogawas didto.
- **Student 1:** Asa man mogawas?
- **Student 2:** Kuan... Let's say for the side of...
- **Student 1:** Adto sa Google Sheets? Sige padayon, sige daw.
- **Student 2:** Kay for the side of the adviser or si sir, kailangan man gyud siya maka-access sa links, di ba? And I mean we have that here.
- **Student 1:** Kana, oo.
- **Student 2:** Right? Oh not here, asa to? Kani, kaning review, right? Technically, it has it here.
- **Student 1:** Okay.
- **Student 2:** Kay you can open the submitted link.
- **Student 1:** Actually we haven't tried pa nga kuan, someone submitted a Google Drive... unsa na? Google Sheets, sway kana. Kato sa MVP, wala pa ta kasuway og Google Sheets.
- **Student 2:** Wa pa bitaw ta kasuway og Google Sheets.
- **Student 1:** Suwayan nato sa kuan, pero I'm still kind of confused. Okay ra man, pero ako kay wala pa koy API actually for writeback.
- **Student 2:** This overloads my phone.
