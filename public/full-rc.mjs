// Original Reading practice material. Not sourced from ETS or an official test.
const reading = [];

// A seeded Fisher–Yates shuffle distributes the correct letters evenly within each
// part without exposing a repeating position cycle. Distractors are shuffled too.
let state = 0xa02cf505;
function nextRandom() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}
function shuffle(values) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = nextRandom() % (i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
const placements = {
  5: shuffle(Array.from({ length:30 }, (_, i) => i % 4)),
  6: shuffle(Array.from({ length:16 }, (_, i) => (i + 1) % 4)),
  7: shuffle(Array.from({ length:54 }, (_, i) => (i + 2) % 4))
};
const placementOffset = { 5:0, 6:0, 7:0 };
const Q = (prompt, key, distractor1, distractor2, distractor3, rationale) =>
  ({ prompt, key, other:[distractor1, distractor2, distractor3], rationale });

function add(part, passageId, passages, questions) {
  for (const q of questions) {
    const id = 101 + reading.length;
    const answer = placements[part][placementOffset[part]++];
    const options = shuffle([...q.other]);
    options.splice(answer, 0, q.key);
    reading.push({ id, part, prompt:q.prompt, options, answer, rationale:q.rationale, passageId, passages });
  }
}
const P = (title, text) => ({ title, text });

add(5, null, [], [
Q("All temporary staff must complete the safety orientation _____ they are first allowed to enter the production area.", "before", "although", "because", "despite", "교육 수료가 작업 구역 출입 허용보다 앞선다는 시간 관계를 나타내는 접속사 before가 필요합니다."),
Q("The accounting team will distribute the _____ budget once the board has approved it.", "revised", "revision", "revise", "revises", "명사 budget을 수식하면서 수정된 예산이라는 의미를 만드는 과거분사 revised가 필요합니다."),
Q("Attendees may register online _____ by submitting a completed form at the reception desk.", "or", "yet", "for", "nor", "온라인 등록과 접수처 서류 제출이라는 두 가지 선택지를 or로 연결합니다."),
Q("This printer is designed to operate _____ even in unusually humid conditions.", "reliably", "reliability", "reliable", "rely", "동사 operate를 수식하는 부사 reliably가 필요합니다."),
Q("The management team expects sales to increase _____ the launch of the new membership program.", "following", "unless", "likewise", "whether", "프로그램 출시 뒤를 뜻하는 following이 명사구 the launch 앞에 들어갑니다."),
Q("The warehouse manager asked that the damaged cartons _____ separate from the others.", "be stored", "storing", "are storing", "were stored", "요청을 뜻하는 asked that의 종속절에는 동사원형이 오며, 상자가 보관되므로 수동형 be stored가 맞습니다."),
Q("Please contact the help desk if you are unable to _____ your account using the recovery link.", "access", "assemble", "attend", "inspect", "복구 링크로 계정에 접속한다는 의미이므로 access가 맞습니다."),
Q("All reservations are subject to _____ until a deposit has been received.", "cancellation", "cancel", "canceled", "canceling it", "be subject to 뒤에는 명사가 오며, 취소될 수 있다는 뜻의 cancellation이 적절합니다."),
Q("Applicants should submit two references, one of _____ must be a former supervisor.", "whom", "them", "which", "whose", "추천인 두 명 중 한 명을 나타내는 사람 목적격 관계대명사 whom이 쉼표 뒤 관계절을 연결합니다."),
Q("The vendor offered a small discount _____ the inconvenience caused by the delayed shipment.", "to offset", "is offsetting", "offsets", "offset", "할인을 제공한 목적을 나타내는 to부정사 to offset이 맞습니다."),
Q("Our stores carry _____ fewer seasonal products in January than in December.", "considerably", "considerable", "consideration", "consider", "비교급 fewer를 강화하는 부사 considerably가 들어갑니다."),
Q("Neither the branch manager nor the regional directors _____ available for yesterday's briefing.", "were", "was", "be", "have been", "neither A nor B의 가까운 주어 directors가 복수이며 yesterday로 과거를 나타내므로 were가 맞습니다."),
Q("For security reasons, visitors must keep their identification cards visible _____ the tour.", "throughout", "whenever", "alongside of", "amidst of", "견학이 진행되는 전 시간 동안을 나타내는 전치사 throughout가 들어갑니다."),
Q("The facilities committee will _____ the proposed floor plan for compliance with local building codes before requesting cost estimates.", "review", "retain", "relocate", "retrieve", "견적을 요청하기 전에 제안된 평면도가 건축 규정을 준수하는지 검토하므로 review가 맞습니다."),
Q("The labels on the back of these devices indicate _____ each unit was manufactured.", "when", "what", "whom", "who", "제조된 시점을 나타내는 간접의문절이며, when 뒤는 주어와 동사가 완비되어 있습니다."),
Q("The construction crew postponed the exterior painting _____ heavy rain was forecast.", "because", "because of", "despite", "during", "주어와 동사를 갖춘 절을 뒤에 두고 연기한 이유를 설명하는 접속사 because가 맞습니다."),
Q("Shipping fees will be waived for orders _____ total exceeds $80 before tax.", "whose", "whom", "which", "who", "주문 금액이라는 소유 관계를 표현하는 whose가 명사 total을 수식합니다."),
Q("The original receipt should be kept in case you need to request a _____.", "refund", "refundable", "refunds", "refundably", "관사 a 뒤에 단수 명사가 필요하며, 환불을 요청한다는 뜻의 refund가 맞습니다."),
Q("The new software can _____ convert scanned invoices into searchable files.", "automatically", "automatic", "automate", "automation", "동사 convert를 꾸며 전환 방식이 자동임을 나타내는 부사 automatically가 맞습니다."),
Q("The exhibition hall is large enough to _____ up to six hundred visitors.", "accommodate", "administer", "accompany", "allocate", "전시장이 최대 600명을 수용할 수 있다는 맥락이므로 accommodate가 맞습니다."),
Q("Employees who have already completed the survey do not need to submit it _____.", "again", "soonest", "instead", "either", "이미 작성한 설문을 다시 제출할 필요가 없다는 뜻이므로 again이 맞습니다."),
Q("The conference center requests _____ confirmation of dietary requirements by Monday.", "written", "writing", "wrote", "write", "서면 확인을 의미하는 written confirmation에서 written이 명사를 수식합니다."),
Q("If a suitable replacement _____ by Thursday, the maintenance team will complete the repair on Friday.", "arrives", "would arrive", "will have arrived", "arriving", "미래 조건을 나타내는 if절에서는 현재형을 사용합니다."),
Q("Ms. Sato praised the logistics team for its _____ response to the unexpected office closure.", "prompt", "promptly", "promptness", "prompting", "명사 response를 수식하는 형용사 prompt가 필요하며, '신속한 대응'이라는 뜻입니다."),
Q("We recommend updating your browser to take _____ of the new reporting features.", "advantage", "interest", "effort", "permission", "take advantage of는 활용하다는 뜻의 고정 표현입니다."),
Q("The course is aimed at employees _____ responsibilities now include managing a team.", "whose", "whom", "which", "where", "직원들의 책임이라는 소유 관계를 나타내는 관계대명사 whose가 적절합니다."),
Q("The delivery schedule was adjusted so that all branches _____ receive fresh supplies before the holiday.", "could", "must have", "ought", "used to", "so that 절에서 과거 시점에 가능하게 하려던 목적을 표현하는 could가 맞습니다."),
Q("The reception area is being renovated; visitors should _____ use the side entrance.", "therefore", "similarly", "otherwise", "nevertheless", "공사와 측면 출입구 이용 지시가 원인과 결과 관계이므로 therefore가 맞습니다."),
Q("Please have your supervisor _____ the expense report before submitting it to Finance.", "sign", "signed", "signing", "signs", "사역동사 have 다음에 사람 목적어와 동사원형 sign을 사용합니다."),
Q("The policy applies to outside contractors as well as _____ employees.", "permanent", "permanence", "permanently", "permanence of", "정규 직원에 해당하는 형용사 permanent가 명사 employees를 수식합니다.")
]);

add(6, "p6-workshop", [P("Email | Revised workshop arrangements",
`To: Digital Skills Workshop registrants
From: People Development
Subject: Updated venue and access details

Friday's workshop will be held in Studio C instead of Room 4. The new space is _____ [131] with enough charging outlets for all registered attendees. The workshop will still begin at 9:30 a.m. _____ [132]

Please download the practice files the day before the event. A link _____ [133] in a separate message tomorrow. If the message does not appear in your inbox by 4 p.m., check your junk folder before _____ [134] the training desk.`)], [
Q("Choose the best answer for blank [131].", "equipped", "estimated", "employed", "exchanged", "be equipped with는 필요한 설비를 갖추고 있다는 뜻입니다."),
Q("Choose the best sentence for blank [132].", "The change affects only the workshop location.", "The practice files were removed last year.", "Registration will not reopen until next month.", "All attendees must bring a replacement outlet.", "장소가 바뀌었지만 시작 시간은 그대로라는 앞 문장을 자연스럽게 정리합니다."),
Q("Choose the best answer for blank [133].", "will be sent", "was sending", "has sent", "will send", "내일 링크가 발송된다는 미래 수동태가 필요합니다."),
Q("Choose the best answer for blank [134].", "contacting", "contact", "contacted", "contacts", "전치사 before 뒤에 동명사 contacting을 씁니다.")
]);

add(6, "p6-subscription", [P("Notice | Bean delivery pilot",
`Harbor Street Roasters is testing a monthly delivery service for coffee beans. Subscribers will receive two bags selected by our roasting team. Customers with a decaf preference should indicate it _____ [135] the order form.

The first shipment is planned for May. We have limited the number of initial subscriptions _____ [136] we can make sure each shipment is packed by hand. _____ [137] If all places are filled, the Web site will offer a waiting list instead of taking payment.

Subscribers can change their address up to five days before each delivery. Changes made after this _____ [138] will apply to the following shipment.`)], [
Q("Choose the best answer for blank [135].", "on", "about", "above", "toward", "양식에 정보를 기재한다는 의미로 on the order form이 맞습니다."),
Q("Choose the best answer for blank [136].", "so that", "except that", "even though", "now that", "손으로 포장할 수 있도록 가입자 수를 제한한 목적을 so that으로 표시합니다."),
Q("Choose the best sentence for blank [137].", "Enrollment will close once fifty customers have signed up.", "Customers are welcome to visit our café for lunch.", "Our courier added Saturday deliveries last year.", "The roasting team introduced a new uniform in May.", "다음 문장의 '모든 자리가 찰 경우'를 뒷받침할 구체적인 정원 정보입니다."),
Q("Choose the best answer for blank [138].", "deadline", "delivery van", "selection", "shipment fee", "발송 5일 전까지 변경할 수 있다는 마감 기한을 가리킵니다.")
]);

add(6, "p6-bicycles", [P("Memo | Bicycle storage during repairs",
`To: North Quay office tenants
From: Property Services

Starting on Monday, the bicycle room beside the main lobby will be closed for floor repairs. Please remove your bicycle _____ [139] Friday at 6 p.m. Any bicycles remaining after that time will be moved by our staff to a locked maintenance area.

_____ [140] To use it, enter the adjacent parking structure from Pear Street and follow the green bicycle signs. Your office access card will work at the storage gate.

We _____ [141] to reopen the main bicycle room next Thursday. If the work takes longer than planned, we will send tenants another update _____ [142].`)], [
Q("Choose the best answer for blank [139].", "by", "since", "during", "within", "금요일 6시라는 시점까지 완료하라는 의미의 by입니다."),
Q("Choose the best sentence for blank [140].", "A temporary storage area is available in the meantime.", "All floor materials were delivered two years ago.", "The lobby doors must remain open after closing.", "The maintenance team inspects the lobby on foot.", "다음 문장의 it은 임시 자전거 보관 구역을 가리킵니다."),
Q("Choose the best answer for blank [141].", "expect", "expectation", "expecting", "expectedly", "주어 We 뒤 동사가 필요하고 expect to reopen은 재개를 예상한다는 뜻입니다."),
Q("Choose the best answer for blank [142].", "promptly", "prompt", "promptness", "more prompt", "send를 수식해 신속하게 공지하겠다는 뜻을 만드는 부사가 필요합니다.")
]);

add(6, "p6-labels", [P("Customer letter | Packaging adjustment",
`Dear Retail Partner,

From August 1, the unit size and price of our Meadow Spice Mix will remain the same, but the label will look different. The new design provides larger preparation instructions. _____ [143]

A preview of the label is attached for stores _____ [144] need to update their online product images. Stores may sell packages with either label until their existing stock runs out. No special action is _____ [145] at checkout: the barcode is unchanged.

Please direct any questions _____ [146] the change to your usual sales representative.`)], [
Q("Choose the best sentence for blank [143].", "The ingredients and allergen information have not changed.", "We are no longer accepting wholesale orders.", "The jar will be replaced with a larger box.", "The new price will be listed on a separate page.", "앞 문장은 달라지는 라벨 디자인을, 이 문장은 변하지 않는 제품 정보를 설명합니다."),
Q("Choose the best answer for blank [144].", "that", "what", "where", "whose", "선행사 stores를 수식하며 need의 주어가 되는 관계대명사 that이 필요합니다."),
Q("Choose the best answer for blank [145].", "required", "requiring", "require", "requirement", "특별 조치가 요구되지 않는다는 수동태 is required입니다."),
Q("Choose the best answer for blank [146].", "regarding", "among", "upon", "until", "변경에 관한 질문을 뜻하므로 regarding이 적절합니다.")
]);

export const rcQuestions = reading;
const R = (id, docs, items) => add(7, id, docs, items);

R("p7-roof", [P("Notice | Roof garden maintenance",
`The roof garden at Keel House will close at noon on Wednesday for replacement of a damaged railing. Weather permitting, it will reopen at 8 a.m. on Friday. The adjoining meeting pavilion will remain open and can be reached from the east stairwell. Please collect any personal items from the garden by 11:45 a.m. on Wednesday. The front desk will hold any items left behind until the following Monday.`)], [
Q("Why will the roof garden close?", "To replace part of a safety barrier", "To prepare for a private gathering", "To repair the east stairwell", "To clean the meeting pavilion", "손상된 난간을 교체하기 위해 정원을 닫습니다."),
Q("How can occupants reach the pavilion during the closure?", "Via the east stairwell", "Through the front desk", "Through the garden gate", "By using a service elevator", "폐쇄 중에는 동쪽 계단을 통해 회의 공간에 도달할 수 있습니다."),
Q("What is indicated about items left in the garden?", "They can be claimed at the front desk.", "They will stay in the garden until Friday.", "They will be donated on Wednesday.", "They must be collected from the pavilion.", "프런트 데스크가 남은 소지품을 월요일까지 보관합니다.")
]);

R("p7-packing", [P("Email | Request for sample mailers",
`To: Caldera Packaging
From: Amira Patel, Juniper Lamp Studio
Subject: Protective mailers

We are choosing packaging for a desk lamp that will go on sale in October. Our budget allows up to $3.20 per mailer. Your catalog lists the standard mailer within that limit, but we would like to see whether its insert holds the lamp firmly when the box is turned on its side. Would you send two sample units to our product team? We can provide dimensions in advance if that would be helpful.

Please use our Franklin Avenue office address. The workshop on Bay Road no longer receives parcels.`)], [
Q("Why did Ms. Patel write the email?", "To ask for sample packaging", "To change the delivery date for lamps", "To report a damaged shipment", "To cancel a packaging order", "포장재 표준 제품 샘플 두 개를 보내 달라는 요청이 핵심입니다."),
Q("What does Ms. Patel want to test?", "Whether the lamp stays in position", "Whether the box fits on a retail shelf", "Whether the mailer is waterproof", "Whether a label can be removed cleanly", "상자를 옆으로 돌렸을 때 내부 고정재가 램프를 움직이지 않게 잡는지 확인하려고 합니다."),
Q("What is stated about the Bay Road workshop?", "It no longer accepts parcel deliveries.", "It has recently reopened.", "It produces sample mailers.", "It is the site of the product launch.", "마지막 문장에서 Bay Road 작업장은 더 이상 택배를 받지 않는다고 설명합니다.")
]);

R("p7-library", [P("Announcement | Project room bookings",
`Ternshire Library has added two project rooms for groups of three to eight people. Bookings are free for cardholders and can be made up to ten days in advance. Each booking lasts ninety minutes. If no one has reserved the next time slot, a group can ask desk staff for an extra thirty minutes. Both rooms contain a wireless display. Adapter cables may be borrowed from the desk, but visitors should bring their own charging cords.`)], [
Q("Who can reserve a project room without a fee?", "Library cardholders", "Visitors who bring a cable", "Groups with at least nine people", "Only local teachers", "카드를 가진 이용자는 무료로 예약할 수 있습니다."),
Q("When may a booking be extended?", "When the next time slot is unreserved", "When the booking was made ten days earlier", "When both project rooms are occupied", "When a staff member joins the group", "다음 시간대에 다른 예약이 없을 때 30분 연장을 요청할 수 있습니다."),
Q("What should visitors supply themselves?", "Charging cords", "Adapter cables", "A wireless display", "A key for the room", "어댑터는 빌릴 수 있지만 충전 케이블은 방문객이 직접 가져와야 합니다.")
]);

R("p7-chat", [P("Team chat | Friday demonstration",
`10:02 Jules: The projector in Birch Room is flickering again. Friday's software demonstration starts there at 2.
10:04 Cam: Elm Room is free at 2 and has the same seating capacity. I can move our booking.
10:05 Priya: Please do. I'll email the external guests. Can someone also change the printed sign by reception?
10:08 Jules: I'll take care of the sign this afternoon. Could you tell guests that the start time is unchanged?
10:09 Priya: Of course. I'll put that in the first line.`)], [
Q("Why is the team changing rooms?", "A piece of presentation equipment is not working properly.", "The number of guests has increased.", "The original room has been double-booked.", "The guests asked for a larger room.", "Birch Room의 프로젝터가 계속 깜박이는 것이 이동 사유입니다."),
Q("What will Jules do?", "Update a sign", "Email outside guests", "Reserve Elm Room", "Repair a projector", "Jules는 접수처 옆 인쇄 표지판을 오후에 바꾸기로 합니다."),
Q("What does Priya mean by “I'll put that in the first line”?", "She will emphasize that the event still starts at the same time.", "She will ask all guests to arrive early.", "She will print the sign at the front desk.", "She will send guests the updated program as an attachment.", "바로 앞 메시지의 '시작 시간은 그대로'라는 내용을 이메일 첫 줄에 넣겠다는 뜻입니다.")
]);

R("p7-ferry", [P("Schedule notice | Breakwater commuter ferry",
`From June 5 to June 23, the 7:10 a.m. ferry from Fisher Pier will leave from Market Steps instead. All other departures from Fisher Pier will operate as usual. Valid monthly passes will be accepted at Market Steps without an exchange, but paper single tickets purchased for Fisher Pier must be reprinted at the kiosk. Allow an additional ten minutes to walk from the train stop. The first train of the day is not affected.`)], [
Q("Which trip temporarily changes its departure point?", "The 7:10 a.m. ferry", "The first train of the day", "All ferries from Fisher Pier", "The last ferry from Market Steps", "피셔 부두의 오전 7시 10분 페리만 출발 장소가 바뀝니다."),
Q("Who must use the kiosk?", "Passengers with a paper single ticket bought for Fisher Pier", "All monthly pass holders", "Passengers arriving by the first train", "Anyone traveling after June 23", "피셔 부두에서 산 종이 편도 승차권만 키오스크에서 다시 인쇄해야 합니다."),
Q("What does the notice advise travelers to do?", "Allow more time for the walk from the train stop", "Take the last train instead of the first", "Buy a temporary monthly pass", "Board at Fisher Pier before 7 a.m.", "기차 정류장에서 도보로 이동하는 데 10분 더 잡으라고 안내합니다.")
]);

R("p7-ad", [P("Job listing | Inventory assistant",
`Greenacre Tool Hire is hiring a part-time inventory assistant for its Belmont shop. Shifts are 7 a.m. to noon on Tuesdays and Thursdays. The successful applicant will count returned equipment, record any damage, and prepare rental kits for afternoon customers. Equipment repair is handled by a separate team. Training on the shop's inventory system is provided. Apply by September 14 with a résumé and a brief statement describing a time you caught an error at work.`)], [
Q("What is one duty of the inventory assistant?", "Preparing sets of equipment for customers", "Repairing damaged rental equipment", "Delivering equipment to customers", "Teaching the repair team to use software", "오후 고객을 위해 대여 장비를 묶음으로 준비하는 일이 포함됩니다."),
Q("What must applicants describe?", "An occasion when they noticed a mistake", "Their preferred work schedule", "A past software training course", "How they repaired a piece of equipment", "업무에서 실수를 발견했던 경험을 짧게 설명하라고 합니다."),
Q("What is mentioned about the inventory system?", "Instruction in its use is available.", "It will be replaced before September.", "Applicants must already know how to use it.", "Only afternoon employees are allowed to use it.", "상점의 재고 관리 시스템 이용법은 교육을 제공합니다.")
]);

R("p7-interview", [P("Company newsletter | Five questions with Mara Ellis",
`Mara Ellis used to manage route planning for Aster Couriers. Last month she moved to the customer experience team to lead a pilot that gives customers a two-hour delivery window rather than an all-day estimate. She says her route-planning experience has helped her determine where narrower windows are realistic. The pilot will run in Westport for six weeks. If missed deliveries decrease, Aster will consider testing it in a larger city next spring.`)], [
Q("What was Ms. Ellis's previous responsibility?", "Planning delivery routes", "Handling damaged parcels", "Recruiting customer service staff", "Maintaining delivery vehicles", "Mara Ellis는 이전에 배송 경로 계획을 맡았습니다."),
Q("What change is being tested?", "Providing a narrower delivery time range", "Adding weekend routes to a larger city", "Dropping some home delivery addresses", "Moving customer support to Westport", "하루 단위 도착 예상 대신 2시간 범위로 안내하는 실험입니다."),
Q("What outcome may lead to another test?", "Fewer unsuccessful delivery attempts", "More vehicles on each route", "A shorter training program", "An increase in parcel prices", "배송 실패가 감소하면 더 큰 도시에서 시험할 가능성이 있습니다.")
]);

R("p7-invoice", [P("Billing email | Deposit applied",
`Dear Mr. Liao,

We have applied your $200 reservation deposit to invoice GH-805 for the East Gallery rental on November 16. The remaining $460 is due seven days before the event. If you pay by bank transfer, put GH-805 in the payment reference field.

The invoice does not include an additional microphone, which you mentioned last week. If you decide to request one, let us know before November 10 and we will issue a separate invoice. The standard sound system included in your rental has one microphone.`)], [
Q("How much is still due on invoice GH-805?", "$460", "$200", "$660", "$805", "보증금 $200을 반영한 뒤 남은 청구 금액은 $460입니다."),
Q("What should Mr. Liao include with a bank transfer?", "The invoice identifier", "An updated event schedule", "The name of the sound technician", "The gallery's street address", "은행 이체의 참조란에 인보이스 번호 GH-805를 입력해야 합니다."),
Q("What would result in another invoice?", "A request for a second microphone", "Payment of the existing balance", "Using the basic sound system", "Applying the reservation deposit", "기본 구성에 마이크 1대가 포함되며, 추가 마이크를 요청하면 별도로 청구됩니다.")
]);

R("p7-sidebar", [P("Article | Adding a quiet hour",
`Marlin Community Market will open its weekend craft fair thirty minutes earlier on Saturdays in March. [1] Between 9:00 and 9:30 a.m., background music will be off and vendor demonstrations will not take place. [2] The quieter period was suggested by vendors after customers asked when the hall was least noisy. [3] Admission prices will remain unchanged. [4] The market will collect feedback at the exit before deciding whether to continue the arrangement in April.`)], [
Q("What will not happen between 9 and 9:30 a.m.?", "Vendor demonstrations", "Ticket sales", "Customer entry", "Craft purchases", "조용한 시간에는 배경 음악과 판매자 시연이 없습니다."),
Q("Where does the following sentence best belong? “Both will resume at 9:30 a.m., when the regular program begins.”", "[2]", "[1]", "[3]", "[4]", "Both는 바로 앞에서 언급된 배경 음악과 판매자 시연을 가리키므로 [2]가 맞습니다."),
Q("What will the market use to inform its April plans?", "Feedback gathered at the exit", "The number of new vendors", "A report on admission prices", "Recommendations from musicians", "퇴장 장소에서 의견을 수집한 뒤 4월에도 계속할지 결정합니다.")
]);

R("p7-return", [P("Policy excerpt | Field test devices",
`Loaned field meters should be returned to the cabinet within three working days of use. If a meter has been used in wet conditions, place it on the drying shelf instead and attach a completed condition tag. Do not put a wet meter in its carrying case. Missing accessories must be reported through the equipment portal so that the next borrower can be offered a spare.`)], [
Q("Where should a meter that was used in the rain be left?", "On the drying shelf", "In its carrying case", "Immediately inside the cabinet", "On the next borrower's desk", "젖은 상태에서 사용한 장비는 보관함 대신 건조 선반에 둡니다."),
Q("Why should missing accessories be reported?", "So a replacement can be provided to the next user", "So the loan deadline can be extended", "So the meter can be put in a carrying case", "So the drying shelf can be moved", "다음 대여자에게 여분 부속품을 제공할 수 있도록 누락을 보고해야 합니다.")
]);

R("p7-expo", [P("Event brief | Inland Design Exchange",
`Exhibitors: Please unload equipment at Gate 2 between 7 and 8:30 a.m. on May 8. Stands in Hall A must be fully assembled by 9 a.m. Hall B stands must be ready by 9:30 a.m. Power strips are available by prepaid request only. To reserve one, return the utilities form by May 3. Public entry begins at 10 a.m.`),
P("Email | Exhibit logistics", `To: Morgan Reed
From: Elise Dunn
Date: May 2

Our maker space has been assigned stand B17 in Hall B. The van will arrive at 8 a.m. with the display panels. I will bring the demonstration kit separately. It needs power, and I did not see a power strip listed in our order confirmation. Could you submit the utilities form today? I can help set up once I finish registering the van at Gate 2.`)], [
Q("For whom is the brief intended?", "Organizations with display stands", "Guests buying tickets at the gate", "Personnel from the public transport office", "Food court employees only", "전시 부스를 설치하는 참가자에게 하역 및 준비 일정을 안내하는 문서입니다."),
Q("By what time must the maker space finish assembling its stand?", "9:30 a.m.", "8 a.m.", "8:30 a.m.", "10 a.m.", "이메일의 B17은 B홀 배정이며 행사 안내에 B홀 완료 시각이 9시 30분이라고 나옵니다."),
Q("Why does Ms. Dunn mention the order confirmation?", "To explain why she thinks another request is needed", "To show what time public entry begins", "To prove that the van already has a parking permit", "To ask whether the stand number can be changed", "기존 확인서에 멀티탭이 없어서 별도 신청이 필요하다고 판단했습니다."),
Q("What must Mr. Reed submit by May 3?", "A utilities form", "A vehicle insurance record", "A demonstration script", "A proof of public entry payment", "안내문에 멀티탭을 예약하려면 5월 3일까지 설비 신청서를 제출하라고 나옵니다."),
Q("What will arrive in the van?", "Display panels", "A demonstration kit", "Public entry tickets", "The requested power strip", "밴에는 전시 패널을 싣고, 시연 키트는 Ms. Dunn이 별도로 가져옵니다.")
]);

R("p7-shuttle", [P("Staff bulletin | Temporary changes to campus shuttles",
`During the summer, Route 3 will not serve the Ocean Building after 6 p.m. Employees leaving after that time may request a ride from the North Gate by calling Campus Transport at least fifteen minutes before departure. Rides are covered by the employee travel program. Bikes cannot be carried on the on-request shuttle. The last fixed departure from the Ocean Building is at 5:55 p.m.`),
P("Email | Wednesday inventory close", `From: Ren Okada
To: Campus Transport

I will finish inventory at the Ocean Building at about 7 p.m. on Wednesday. Could you confirm that the North Gate booth will be open? I normally cycle to and from work, but my bike will be at the repair shop on Wednesday. I will call at 6:40 p.m. to request a ride for 7 p.m. My staff ID is W217.`)], [
Q("What change is described in the bulletin?", "A scheduled route will stop serving a building in the evening.", "A fixed shuttle will begin carrying bicycles.", "The North Gate will be closed all summer.", "The staff travel program will start charging for every ride.", "여름 동안 3번 노선은 오후 6시 이후 Ocean Building에 정차하지 않습니다."),
Q("Where should Mr. Okada go to board the requested shuttle?", "The North Gate", "The Ocean Building entrance", "The repair shop", "The inventory office", "오후 6시 이후 요청 셔틀은 North Gate에서 탑승합니다."),
Q("Does the planned call meet the stated timing requirement?", "Yes, it is twenty minutes before the planned ride.", "Yes, calls can be made any time after 7 p.m.", "No, calls must be placed before 5:55 p.m.", "No, calls must be made one day in advance.", "6시 40분은 7시 출발보다 20분 앞서므로 최소 15분 조건을 충족합니다."),
Q("Why does Mr. Okada plan to use the shuttle?", "His usual form of transportation will not be available.", "His new travel pass is about to expire.", "The fixed shuttle will not allow him to carry work supplies.", "He needs to bring a bicycle onto the shuttle.", "평소 이용하는 자전거를 수리점에 맡길 예정이어서 셔틀을 이용하려고 합니다."),
Q("In the bulletin, the word “covered” is closest in meaning to", "paid for", "hidden by", "written about", "guarded against", "직원 교통 프로그램이 요청 셔틀 요금을 부담한다는 문맥에서 covered는 paid for에 해당합니다.")
]);

R("p7-menu", [P("Catering sheet | Pepperfern Kitchen",
`Lunch boxes (minimum order: 8)
Garden Box — roasted vegetables and rice; dairy-free; $12
Pantry Box — turkey sandwich and fruit; $13
Cafe Box — spinach tart and salad; $15
Orders for fewer than 20 boxes must be placed at least one working day before pickup. Orders for 20 or more require two working days' notice. Pickup is available between 11 a.m. and 2 p.m. on weekdays. A same-day change to box contents is not guaranteed.`),
P("Internal message | Thursday training lunch", `From: Sienna Blake
To: Noah Mercer
Tuesday, 9:30 a.m.

Our Thursday roster now has 22 participants. Please reserve 18 Pantry Boxes and 4 Garden Boxes for pickup at 11:30 a.m. I chose the Garden Box because four participants asked for a meal with no dairy. Please place the order today rather than waiting for final slide approval. I can collect the boxes after setting up the classroom.`)], [
Q("How long in advance does Pepperfern require this order?", "Two working days", "One working day", "Three working days", "One week", "22개라서 20개 이상 주문에 적용되는 업무일 이틀 전 규정이 적용됩니다."),
Q("What is the cost of the order before any taxes?", "$282", "$264", "$286", "$294", "Pantry 18개 × $13 = $234, Garden 4개 × $12 = $48이므로 합계 $282입니다."),
Q("Why were four Garden Boxes requested?", "Some attendees require meals without dairy.", "The Pantry Box is temporarily unavailable.", "Four meals must be reserved for the kitchen staff.", "The caterer limits Pantry Box orders to 18.", "참가자 네 명이 유제품 없는 식사를 요청했고, Garden Box가 해당 조건에 맞습니다."),
Q("Who plans to pick up the lunch boxes?", "Ms. Blake", "Mr. Mercer", "A caterer's driver", "The person approving the slides", "메시지를 보낸 Sienna Blake가 교실 설치 뒤 직접 찾아가겠다고 합니다."),
Q("What cannot be counted on after the order is placed?", "A change to the box contents on pickup day", "Availability of a weekday pickup", "The Garden Box being dairy-free", "A pickup at 11:30 a.m.", "케이터링 안내에서 당일 구성 변경은 보장되지 않는다고 명시합니다.")
]);

R("p7-cleaning", [P("Proposal | Clearstep Janitorial",
`Prepared for: Riverton Arts Center
Standard evening service: lobby, gallery corridors, and first-floor restrooms; Monday, Wednesday, and Friday; $960 per month.
Optional Friday studio service: dusting tabletops and emptying studio waste bins; $180 per month. Clay-room floors must be cleaned by Arts Center staff using the existing specialist vacuum.
All services begin the first full week after the agreement is signed.`),
P("Email | Service approval", `To: Clearstep Janitorial
From: Imani Wells, Operations
Friday, February 7

We signed the standard agreement today. Please also add the Friday studio option starting March 1. We have a visiting instructor using the clay room, so please confirm whether our employees are still responsible for its floor. For the first cleaning, use the side door on Cedar Lane; the front entrance is reserved for a ticketed event.`),
P("Email | Scheduling confirmation", `To: Imani Wells
From: Tomas Vidal, Clearstep Janitorial
Friday, February 7

We have scheduled your first standard visit for Monday, February 10, and added the Friday studio option to the March invoice. The regular team will clean the studio tables and bins, while your staff will continue to handle the clay-room floor. I will tell our crew to enter from Cedar Lane on Monday.`)], [
Q("What is NOT included in the standard service?", "Cleaning studio tabletops", "Cleaning first-floor restrooms", "Cleaning gallery corridors", "Cleaning the lobby", "작업실 탁자 청소는 표준 서비스가 아니라 금요일 추가 옵션에 포함됩니다."),
Q("When will the first standard visit take place?", "February 10", "February 7", "March 1", "The final Friday in February", "Tomas Vidal의 확인 이메일에 첫 표준 방문일이 2월 10일 월요일이라고 나옵니다."),
Q("Why will the team use the Cedar Lane door?", "The front entrance is needed for an event.", "The gallery corridors are being painted.", "The specialist vacuum is stored outside.", "The crew needs to unload studio tables.", "첫 청소 때 정문을 티켓 행사에 사용하므로 Cedar Lane 쪽 문으로 출입합니다."),
Q("Who will clean the clay-room floor?", "Arts Center employees", "The visiting instructor", "The studio tables crew", "The event ticketing team", "제안서와 답신 모두 센터 직원이 해당 바닥을 처리한다고 말합니다."),
Q("What is the monthly charge once both services are billed?", "$1,140", "$960", "$780", "$1,180", "월 $960 표준 서비스에 월 $180 작업실 옵션을 더하면 $1,140입니다.")
]);

R("p7-order", [P("Order confirmation | Oakline Office Supply",
`Order OL-6428 | October 3
Bill to: Dunmere Surveying
Delivery: reception desk, 32 Gem Street
2 compact filing cabinets, slate color, $145 each
3 packs of folder labels, $8 each
Requested delivery: October 10 before noon
For changes, write to Customer Accounts and include your order number.`),
P("Email | Delivery instructions for OL-6428", `To: Customer Accounts
From: Avery Stone, Dunmere Surveying
Date: October 4

A building inspection has been scheduled for the morning of October 10. Please keep the delivery date but deliver between 1 p.m. and 4 p.m. instead. The reception desk will be staffed then. We do not need to change the product quantities or colors. Please let me know if there is a charge for the change.`),
P("Delivery desk note | OL-6428", `Customer contacted October 4. Delivery moved to October 10, 1–4 p.m. No fee because the vehicle route has not been finalized. Keep delivery to Gem Street reception. Driver: ring reception from the loading entrance; cabinets must be signed for. Label packs may be left with the cabinets once the cabinets are signed for.`)], [
Q("What information is stated in both the original confirmation and the delivery desk note?", "The street and desk for the delivery", "The fee charged for the schedule change", "The total number of cabinets ordered", "The afternoon delivery window", "주문 확인서와 배송 기록 모두 Gem Street 접수처를 배송지로 명시합니다."),
Q("Why did Ms. Stone request the change?", "An inspection is set for the original delivery period.", "Reception is moving to a different building.", "The offices will be closed the entire day.", "The cabinets ordered are not available in slate.", "원래 배송 시간대인 10월 10일 오전에 건물 점검이 잡혀 있기 때문입니다."),
Q("Why is there no charge for the change?", "The delivery route is not yet finalized.", "The company ordered more than two items.", "The customer is paying before delivery.", "Reception agreed to unload the vehicle.", "운송 차량 경로가 확정되기 전이라 일정 변경 수수료가 없다고 합니다."),
Q("What must happen before the label packs can be left?", "Someone must sign for the cabinets.", "Customer Accounts must confirm the cabinet color.", "The vehicle must return to the warehouse.", "The building inspector must sign for the labels.", "캐비닛 수령 서명이 된 뒤 라벨 묶음을 함께 둘 수 있습니다."),
Q("What is the merchandise subtotal of the unchanged order?", "$314", "$290", "$306", "$330", "캐비닛 2개 × $145에 라벨 3개 × $8을 더하면 $314입니다.")
]);
