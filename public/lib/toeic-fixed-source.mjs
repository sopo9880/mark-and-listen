// Original practice material written for Mark & Listen; not an official TOEIC test.
const makeQuestion = (question, choices, key, explanation) => ({
  question,
  choices,
  answer: "ABCD".indexOf(key),
  explanation,
});
const photo = (scene, alt, choices, key, explanation) => ({
  image: `/full-lc-images/${scene}.svg`,
  imageAlt: alt,
  questions: [makeQuestion("Which statement best describes the illustration?", choices, key, explanation)],
});
const response = (question, choices, key, explanation) => ({
  questions: [makeQuestion(question, choices, key, explanation)],
});
const group = (lines, qs, graphic, graphicAlt) => ({
  lines,
  questions: qs.map((row) => makeQuestion(...row)),
  ...(graphic ? { graphic: `/full-lc-images/${graphic}.svg`, graphicAlt } : {}),
});
const q = (question, a, b, c, d, key, explanation) => [question, [a, b, c, d], key, explanation];

export const PART_1 = [
  photo(
    "library-shelves",
    "실내 서가와 손수레가 있는 연습용 삽화",
    [
      "The woman is pushing a cart through a doorway.",
      "The woman is placing a book on a shelf.",
      "The woman is seated at a reading table.",
      "The woman is opening a window.",
    ],
    "B",
    "여성이 서가 쪽으로 팔을 뻗어 책을 넣고 있습니다. 수레가 보이지만 여성이 밀고 있지는 않습니다.",
  ),
  photo(
    "riverside-dock",
    "물가의 부두를 그린 연습용 삽화",
    [
      "Some chairs are facing a stage.",
      "Several bicycles have been hung on a wall.",
      "A man is climbing a ladder.",
      "Several boats are tied to a dock.",
    ],
    "D",
    "밧줄이 보트와 부두의 기둥을 잇고 있습니다. 즉 보트 여러 척이 부두에 묶여 있습니다.",
  ),
  photo(
    "cafe-tables",
    "카페 테라스를 그린 연습용 삽화",
    [
      "Two people are carrying a table together.",
      "A customer is standing next to a menu board.",
      "Some chairs have been stacked beside a wall.",
      "A server is pouring a drink into a glass.",
    ],
    "C",
    "테라스 벽 옆에 의자 여러 개가 포개져 있습니다. 테이블을 옮기거나 음료를 따르는 사람은 없습니다.",
  ),
  photo(
    "warehouse-box",
    "작업대와 상자가 있는 연습용 삽화",
    [
      "A man is using tape to seal a box.",
      "A man is loading a box into a van.",
      "Some boxes are being stored under a staircase.",
      "A worker is lifting a ladder.",
    ],
    "A",
    "남성이 작업대 위 상자의 윗면을 테이프로 봉하고 있습니다. 차량이나 사다리는 보이지 않습니다.",
  ),
  photo(
    "garden-path",
    "정원과 산책로가 있는 연습용 삽화",
    [
      "Some tools have been arranged on a bench.",
      "There is a fence across the path.",
      "A watering can is on its side.",
      "Potted plants are lined up along a path.",
    ],
    "D",
    "화분들이 산책로 가장자리를 따라 줄지어 놓여 있습니다. 물뿌리개는 똑바로 세워져 있습니다.",
  ),
  photo(
    "station-platform",
    "기차역 승강장을 그린 연습용 삽화",
    [
      "A passenger is placing a suitcase on a train.",
      "Two people are looking at a schedule.",
      "A train is crossing over a bridge.",
      "A worker is sweeping the platform.",
    ],
    "B",
    "두 사람이 역 안내판을 바라보고 있고, 그중 한 명이 시간표를 가리키고 있습니다.",
  ),
];

export const PART_2 = [
  response(
    "Where should I leave the signed delivery form?",
    [
      "The courier left ten minutes ago.",
      "I signed up for the morning shift.",
      "In the tray beside the printer.",
    ],
    "C",
    "서류를 둘 장소를 묻습니다. 프린터 옆 서류함이 답입니다.",
  ),
  response(
    "How often do the air filters need to be replaced?",
    ["Every three months.", "The last one is in the storeroom.", "A technician replaced it."],
    "A",
    "How often은 빈도를 묻고, Every three months는 교체 주기를 나타냅니다.",
  ),
  response(
    "Did anyone reserve the training room for Thursday?",
    ["The session lasted two hours.", "I can check the shared calendar.", "Yes, next to the elevator."],
    "B",
    "직접 예·아니요라고 하지 않아도 공유 일정표에서 확인해 보겠다는 응답이 자연스럽습니다.",
  ),
  response(
    "Who is picking up the visiting architects?",
    ["At the south entrance.", "They arrive at noon.", "Nora from the design team."],
    "C",
    "Who에 답하려면 방문객을 맞을 담당자를 말해야 합니다.",
  ),
  response(
    "Why is the copy room door locked?",
    ["The carpet is being replaced.", "There are two copies.", "I left mine on the desk."],
    "A",
    "카펫 공사 중이라는 말이 복사실 문이 잠긴 이유입니다.",
  ),
  response(
    "Which sample would you like me to send to the client?",
    ["We sent it by courier.", "The blue one with the wider lid.", "The client called this morning."],
    "B",
    "Which sample은 샘플을 고르라는 질문입니다. 파란색이며 뚜껑이 넓은 것으로 지정합니다.",
  ),
  response(
    "When does the last shuttle leave the airport?",
    ["From the main entrance.", "It holds twelve passengers.", "At ten fifteen tonight."],
    "C",
    "When에는 출발 시각인 오늘 밤 10시 15분이 맞습니다.",
  ),
  response(
    "Would you mind reviewing the first page before lunch?",
    ["Sure. I have a few minutes now.", "I had lunch downtown.", "It was on the first floor."],
    "A",
    "정중한 검토 요청이며, 지금 시간이 있다고 하며 수락하는 것이 자연스럽습니다.",
  ),
  response(
    "Is the customer service desk still on the first floor?",
    [
      "I left before the store closed.",
      "No, it moved upstairs last week.",
      "The service takes about an hour.",
    ],
    "B",
    "장소가 그대로인지 묻습니다. 지난주 위층으로 옮겼다는 답이 적절합니다.",
  ),
  response(
    "How much did the repair estimate come to?",
    [
      "Anything under two hundred dollars should be fine.",
      "It took nearly all afternoon.",
      "The technician quoted one hundred and eighty dollars.",
    ],
    "C",
    "지불 예상액을 묻는 말입니다. 실제로 받은 견적 $180만이 질문에 답합니다.",
  ),
  response(
    "Mr. Torres wants the revised menu by four.",
    [
      "Then I had better finish the layout now.",
      "Yes, four people ordered the soup.",
      "The restaurant is near the station.",
    ],
    "A",
    "상사가 마감 시간을 알려 주는 평서문입니다. 지금 편집을 마무리하겠다는 반응이 자연스럽습니다.",
  ),
  response(
    "Could you tell me how to start the label printer?",
    ["The labels were sent Friday.", "Press the green button on the side.", "I used the larger printer."],
    "B",
    "프린터 작동 방법을 묻습니다. 측면의 녹색 버튼을 누르라고 설명합니다.",
  ),
  response(
    "Are we ordering replacement chairs or repairing the old ones?",
    [
      "The repairs can be done on site.",
      "We ordered a dozen name badges.",
      "The new model was too expensive, so we are repairing them.",
    ],
    "C",
    "두 행동 사이에서 어느 쪽으로 정했는지 묻습니다. 수리를 택했다는 답이 명확합니다.",
  ),
  response(
    "I cannot find the latest budget spreadsheet.",
    [
      "Try the project folder marked Final.",
      "The budget meeting took forty minutes.",
      "It costs less than the other model.",
    ],
    "A",
    "최신 파일이 보이지 않는다고 했으므로 찾아볼 위치를 제시하는 것이 자연스럽습니다.",
  ),
  response(
    "Why did you take the back entrance today?",
    [
      "On the back of the envelope.",
      "The front one was blocked by a delivery truck.",
      "The entrance closes at six.",
    ],
    "B",
    "우회한 이유를 묻습니다. 정문이 배송 트럭으로 막혀 있었다고 답합니다.",
  ),
  response(
    "You have already called the glass supplier, have you not?",
    [
      "The glass is in the display case.",
      "I usually take suppliers to lunch.",
      "Not yet, but I will call right after this meeting.",
    ],
    "C",
    "부가의문문으로 전화를 했는지 확인합니다. 아직 안 했다는 명확한 응답입니다.",
  ),
  response(
    "Where did you put the spare microphone batteries?",
    ["In the front pocket of the equipment bag.", "It sounds clear from here.", "We need two microphones."],
    "A",
    "여분 전지를 둔 위치를 묻습니다. 장비 가방 앞주머니가 답입니다.",
  ),
  response(
    "Are there enough parking spaces for everyone at the workshop?",
    [
      "That workshop starts on Monday.",
      "We have reserved an overflow lot across the street.",
      "The parking attendant parked my car.",
    ],
    "B",
    "주차 공간이 충분한지 물을 때 별도 추가 주차장을 확보했다는 응답이 적절합니다.",
  ),
  response(
    "Would Tuesday afternoon work for the supplier visit?",
    [
      "We visited two factories.",
      "The supplier sent us a catalog.",
      "I have a site inspection then. How about Wednesday?",
    ],
    "C",
    "가능한 일정을 묻습니다. 기존 일정과 함께 대체 날짜를 제시합니다.",
  ),
  response(
    "Who approved the change to the loading schedule?",
    ["The logistics supervisor did.", "It was changed to three thirty.", "At the loading bay."],
    "A",
    "승인한 사람이 누구인지 묻습니다. 물류 감독자가 승인했다는 답입니다.",
  ),
  response(
    "How did you hear about the vacancy at the museum?",
    [
      "I will hear back by Friday.",
      "A former colleague sent me the listing.",
      "It is closed for renovations.",
    ],
    "B",
    "채용 공고를 알게 된 경로를 묻습니다. 예전 동료가 공고를 전달했다고 답합니다.",
  ),
  response(
    "Has your team decided on a name for the newsletter?",
    [
      "I never received the last issue.",
      "We meet on the second floor.",
      "We have narrowed it down to two choices.",
    ],
    "C",
    "아직 하나로 결정한 것은 아니지만 두 후보까지 좁혔다는 간접 응답입니다.",
  ),
  response(
    "Why do we need a second coat of paint?",
    ["The first coat did not cover the marks.", "I put my coat in the closet.", "We bought two brushes."],
    "A",
    "두 번째 도장이 필요한 이유는 첫 도장으로 자국이 가려지지 않았기 때문입니다.",
  ),
  response(
    "The freight elevator is out of service again.",
    [
      "The service was fast today.",
      "I will redirect the delivery through the west lobby.",
      "There are three floors in this building.",
    ],
    "B",
    "화물 엘리베이터 고장 소식에 대응하여 배송 동선을 바꾸겠다는 응답이 자연스럽습니다.",
  ),
  response(
    "When can I see a proof of the event posters?",
    [
      "The posters are twenty inches wide.",
      "They are for the spring concert.",
      "I can show you a draft tomorrow morning.",
    ],
    "C",
    "교정본을 볼 수 있는 시점을 묻습니다. 내일 아침 초안을 보여 줄 수 있다고 답합니다.",
  ),
];

export const PART_3 = [
  group(
    [
      [
        "rms",
        "Maya, did you hear from the printer about the market brochures? The organizer just asked whether we can bring them to the volunteer orientation on Friday.",
      ],
      [
        "slt",
        "I called this morning. Their folding machine broke, so the regular order will not be ready until Monday. They can print one hundred single-sheet copies by Thursday, though.",
      ],
      [
        "rms",
        "A hundred should cover the orientation. Please confirm that smaller order and have the rest delivered directly to the market on Monday.",
      ],
    ],
    [
      q(
        "What are the speakers mainly discussing?",
        "A volunteer application",
        "A printing order",
        "A market rental fee",
        "An equipment purchase",
        "B",
        "두 사람은 브로슈어 인쇄 지연과 대체 인쇄 주문을 논의합니다.",
      ),
      q(
        "What has caused a delay?",
        "An address was entered incorrectly.",
        "Volunteers requested different dates.",
        "The organizer revised the design.",
        "A piece of equipment stopped working.",
        "D",
        "접지기 고장 때문에 기존 주문은 월요일까지 준비되지 않습니다.",
      ),
      q(
        "What will the woman most likely do next?",
        "Call the printer to confirm a smaller order",
        "Pick up the brochures on Monday",
        "Ask the organizer to move the orientation",
        "Repair the folding machine",
        "A",
        "남자가 대체 인쇄 100부를 확정해 달라고 요청합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "I have a reservation under the name Leung for two nights. Do you happen to have a quieter room than the one beside the elevator?",
      ],
      [
        "rms",
        "I can switch you to room four eighteen, but housekeeping will not finish there until two. You are welcome to leave your suitcase behind the desk.",
      ],
      [
        "slt",
        "That would help. I have an appointment across the street at one, so I can come back afterward. May I collect the room key then?",
      ],
      ["rms", "Certainly. I will leave a note for my colleague at the desk."],
    ],
    [
      q(
        "Where does the conversation most likely take place?",
        "At a hotel",
        "At a repair shop",
        "At an airport kiosk",
        "At a medical office",
        "A",
        "숙박 예약, 객실 번호, 객실 열쇠와 프런트 데스크를 언급하므로 호텔입니다.",
      ),
      q(
        "What does the woman request?",
        "A different appointment",
        "An extra key",
        "A quieter room",
        "A later checkout time",
        "C",
        "엘리베이터 옆 객실보다 조용한 객실이 있는지 묻습니다.",
      ),
      q(
        "What will the man do for his colleague?",
        "Make a phone call",
        "Prepare a room",
        "Change an appointment",
        "Leave a note",
        "D",
        "직원은 교대 동료에게 해당 내용을 메모로 남겨 주겠다고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "I was going to put your volunteer group on materials sorting at nine, but you said they cannot arrive until after ten.",
      ],
      [
        "rms",
        "That is right. Their bus reaches the center at ten twenty, and most people need to leave again by noon.",
      ],
      [
        "slt",
        "In that case, there is an activity that fits. Just remind everyone to wear closed shoes. We will have gloves at the entrance.",
      ],
      ["rms", "Great. I will send them both the dress requirement and the meeting time tonight."],
    ],
    [
      q(
        "Why is the original assignment being changed?",
        "The center is moving to a new building.",
        "The group cannot arrive early enough.",
        "The group has too many volunteers.",
        "The bus company changed its route.",
        "B",
        "원래 활동은 9시인데 자원봉사자들의 버스는 10시 20분에 도착합니다.",
      ),
      q(
        "Look at the graphic. Which activity fits the group?",
        "Materials sorting",
        "Tool inventory",
        "Planter assembly",
        "Mural painting",
        "C",
        "10시 20분 이후에 시작해 정오 전에 끝나는 일정은 10시 30분~11시 45분의 화분 조립뿐입니다.",
      ),
      q(
        "What will the man tell the volunteers to wear?",
        "Name badges",
        "Closed shoes",
        "Matching shirts",
        "Safety goggles",
        "B",
        "여성은 발이 드러나지 않는 신발을 신으라고 전해 달라고 말합니다.",
      ),
    ],
    "volunteer-roster",
    "봉사 활동 시간표: Materials sorting 9:00–10:00, Tool inventory 10:00–11:15, Planter assembly 10:30–11:45, Mural painting 11:30–12:45.",
  ),
  group(
    [
      [
        "rms",
        "How did the first run of the new label printer go? I saw the preview on the monitor and thought the lettering looked sharp.",
      ],
      [
        "slt",
        "The lettering is fine. It is the gray bar at the bottom that disappears when the label comes out. I tested two paper rolls, and it happened both times.",
      ],
      [
        "rms",
        "Let us try a darker shade before we call the manufacturer. Can you export the design with that change and send it to me?",
      ],
    ],
    [
      q(
        "What problem does the woman report?",
        "A monitor cannot be turned on.",
        "A design file cannot be opened.",
        "A printed detail is missing.",
        "A paper roll is the wrong size.",
        "C",
        "화면에 보이던 아래쪽 회색 띠가 실제 출력물에는 나오지 않습니다.",
      ),
      q(
        "What has the woman already tried?",
        "Using two rolls of paper",
        "Exporting another design",
        "Calling the manufacturer",
        "Replacing the monitor",
        "A",
        "서로 다른 종이 롤 두 개로 시험 인쇄했다고 했습니다.",
      ),
      q(
        "What change does the man suggest making?",
        "Replacing the lettering",
        "Adding a second page",
        "Moving the bar to the top",
        "Making one area darker",
        "D",
        "아래쪽 띠의 색을 더 진하게 바꾸자고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "rms",
        "I compared the menu estimates for our staff dinner. The harbor restaurant offered the lowest price, but their private room only seats twenty-four.",
      ],
      [
        "slt",
        "We already have twenty-seven confirmed. How about the place on Hill Street? The menu there is a little more expensive, but it includes dessert.",
      ],
      [
        "rms",
        "There is room for thirty-five there. I will ask whether the price also covers tea and coffee before we pay a deposit.",
      ],
    ],
    [
      q(
        "What event are the speakers planning?",
        "A trade show",
        "An employee meal",
        "A cooking lesson",
        "A product launch",
        "B",
        "직원 저녁 식사를 위한 두 식당의 조건을 비교합니다.",
      ),
      q(
        "Why is the harbor restaurant unsuitable?",
        "It requires a large deposit.",
        "It will close early.",
        "Its private room is too small.",
        "It does not offer dessert.",
        "C",
        "참석 확정 인원은 27명인데 항구의 식당 별실에는 24명만 앉을 수 있습니다.",
      ),
      q(
        "What does the man want to confirm?",
        "Whether beverages are included",
        "How many guests have replied",
        "Whether street parking is available",
        "When the dessert course will be served",
        "A",
        "예약금을 내기 전에 차와 커피가 가격에 포함되는지 물어보려 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "We moved the first recording session to Monday morning, so I will need the podcast guest list before the end of today.",
      ],
      [
        "rms",
        "I can send the names now. However, one guest has not given permission for us to publish her job title yet.",
      ],
      [
        "slt",
        "Send me the list without any job titles. That way we can prepare the guest badges while you wait for her reply.",
      ],
      ["rms", "Good idea. If she responds tomorrow, we can still finish the episode description by Friday."],
    ],
    [
      q(
        "What are the speakers preparing for?",
        "A software demonstration",
        "A television interview",
        "A job fair",
        "A podcast recording",
        "D",
        "일정을 월요일로 옮긴 팟캐스트 녹음을 준비합니다.",
      ),
      q(
        "What information has not been approved for publication?",
        "A company address",
        "A recording time",
        "A guest’s job title",
        "A sponsor’s name",
        "C",
        "한 게스트가 자신의 직함 공개를 아직 허락하지 않았습니다.",
      ),
      q(
        "Why does the woman need the list today?",
        "To prepare identification badges",
        "To submit a travel request",
        "To update a room booking",
        "To print the episode script",
        "A",
        "직함 없이 이름만 받아도 게스트 이름표를 준비할 수 있다고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "rms",
        "I am taking the regional train to Bellwick this afternoon. The app says my train is delayed, but I cannot find it on the screen. It was supposed to leave at two thirty-five.",
      ],
      [
        "slt",
        "The departure number stays the same, even when the time changes. The screen is showing the revised times and tracks now.",
      ],
      ["rms", "Oh, I see it. Do I have enough time to get to the other side of the station?"],
      ["slt", "Yes. Use the passage beside the ticket machines. That route avoids the stairs."],
    ],
    [
      q(
        "What has happened to the man’s train?",
        "It has been canceled.",
        "It is running late.",
        "It arrived ahead of time.",
        "It requires a seat reservation.",
        "B",
        "앱으로 지연을 확인했고 안내판은 변경된 출발 시각을 보여 줍니다.",
      ),
      q(
        "Look at the graphic. Which track should the man go to?",
        "Track 1",
        "Track 2",
        "Track 3",
        "Track 4",
        "D",
        "Bellwick 행의 원래 시각 2:35를 찾으면 수정 시각은 2:50, 승강장은 4번입니다.",
      ),
      q(
        "What does the woman advise the man to do?",
        "Wait by the main entrance",
        "Buy a new ticket",
        "Use a passage near the machines",
        "Take the stairs down",
        "C",
        "계단 대신 매표기 옆 통로를 이용하라고 안내합니다.",
      ),
    ],
    "train-departures",
    "열차 출발표: Arlen 예정 2:20 변경 없음 1번, Dunbar 예정 2:30 변경 없음 3번, Bellwick 예정 2:35 변경 2:50 4번, Elmbrook 예정 2:45 변경 없음 2번.",
  ),
  group(
    [
      [
        "slt",
        "I looked through the returns from last week. Did we really sell twelve rain jackets with broken zippers?",
      ],
      [
        "rms",
        "They came from a single delivery. I checked the rest of our stock, and the zippers from the newer shipment look fine. The supplier wants the order number before authorizing a refund.",
      ],
      [
        "slt",
        "It is on the white sticker inside the original carton. I put that carton beside the cash register yesterday.",
      ],
      ["rms", "I will look there and send the number right away."],
    ],
    [
      q(
        "Where do the speakers most likely work?",
        "At a clothing store",
        "At a travel agency",
        "At a building site",
        "At a dry cleaner",
        "A",
        "재킷 판매분의 반품, 재고와 계산대를 다루므로 의류 매장입니다.",
      ),
      q(
        "What does the supplier need?",
        "A photograph of a zipper",
        "A delivery address",
        "An order number",
        "A revised price list",
        "C",
        "공급업체는 환불 승인 전에 주문 번호를 요청합니다.",
      ),
      q(
        "Where will the man most likely look next?",
        "Near the cash register",
        "Inside the newest jacket",
        "In an email folder",
        "On a shelf by the entrance",
        "A",
        "기존 상자는 계산대 옆에 있으며 상자 내부 흰색 스티커에 주문 번호가 있습니다.",
      ),
    ],
  ),
  group(
    [
      [
        "rms",
        "The workshop went well. Did the feedback cards say anything about the handouts? I thought the diagrams might have been too small.",
      ],
      [
        "slt",
        "Only one person mentioned that. Several people asked for another ten minutes to finish the practice exercise.",
      ],
      [
        "rms",
        "We cannot extend the room booking, but the opening slides take almost ten minutes. How about putting those in the confirmation email instead?",
      ],
      ["slt", "That would leave more time for practice. I can turn the slides into a short attachment."],
    ],
    [
      q(
        "What are the speakers reviewing?",
        "A room floor plan",
        "A workshop evaluation",
        "A conference budget",
        "A list of invited guests",
        "B",
        "워크숍 참가자의 피드백 카드를 검토하고 있습니다.",
      ),
      q(
        "What did several people request?",
        "Larger diagrams",
        "Different handouts",
        "More time for an exercise",
        "An earlier start",
        "C",
        "여러 명이 연습 과제를 마칠 시간 10분을 더 요청했습니다.",
      ),
      q(
        "What change does the man propose?",
        "Booking a larger room",
        "Replacing the practice exercise",
        "Moving the event to another date",
        "Sending introductory slides in advance",
        "D",
        "오프닝 슬라이드를 참가 확인 메일에 넣어 발표 시간을 아끼자고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "The artists for Saturday’s street fair want to set up at seven. I could unlock the west gate for them, but that is also when the produce deliveries arrive.",
      ],
      [
        "rms",
        "If they use the east gate instead, they can unload without blocking delivery vehicles. I can make sure the gate attendant is there by quarter to seven.",
      ],
      [
        "slt",
        "Thanks. I will revise the arrival map and send it this afternoon with the unloading instructions.",
      ],
    ],
    [
      q(
        "What is the woman concerned about?",
        "An event might be postponed.",
        "Two groups may need the same entrance.",
        "A customer might get lost.",
        "The maps show the wrong date.",
        "B",
        "예술가 설치 시간과 농산물 배송이 겹쳐 서쪽 출입구에 혼잡이 생길 수 있습니다.",
      ),
      q(
        "What will the man arrange?",
        "The purchase of extra supplies",
        "The early arrival of a gate attendant",
        "The delivery of more produce",
        "The display of artwork near the main road",
        "B",
        "남자는 6시 45분까지 동쪽 출입구 담당자가 오도록 하겠다고 합니다.",
      ),
      q(
        "What will the woman update?",
        "An event map",
        "A vehicle registration",
        "A list of food vendors",
        "A safety report",
        "A",
        "변경된 도착 경로를 반영해 도착 안내 지도를 수정하겠다고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "rms",
        "Is the demonstration garden ready to open for the public tour? The gardeners said the paths were dry enough this morning.",
      ],
      [
        "slt",
        "The paths are fine, but two information signs came loose after the storm. We could rope off the back section and still show the greenhouse and the herb beds.",
      ],
      [
        "rms",
        "Let us do that. Can you put a temporary notice near the ticket booth? Visitors should know the route is shorter before they purchase tickets.",
      ],
    ],
    [
      q(
        "What are the speakers preparing for?",
        "A ticket sales meeting",
        "A building inspection",
        "A public garden tour",
        "A gardening class",
        "C",
        "공개 관람 코스를 열 수 있는 상태인지 이야기합니다.",
      ),
      q(
        "Why might part of the garden be closed?",
        "The paths are wet.",
        "Some signs need to be secured.",
        "Plants have to be moved.",
        "A greenhouse door is locked.",
        "B",
        "폭풍으로 안내판 두 개가 느슨해졌다고 합니다.",
      ),
      q(
        "Where does the man want a notice placed?",
        "At the herb beds",
        "Near the greenhouse",
        "Beside a garden entrance",
        "Near the ticket booth",
        "D",
        "관람객이 결제 전에 알 수 있도록 매표소 근처에 공지를 두라고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "I am trying to choose a location for a software training session. We need twelve seats, a projector, and access to the room before nine.",
      ],
      [
        "rms",
        "The small meeting room is too narrow for that group. I added the current opening times, room capacities, and equipment to the comparison chart you are holding.",
      ],
      [
        "slt",
        "This room works. Would you ask the receptionist to have the room unlocked by eight forty-five? I want to test the projector before anyone arrives.",
      ],
    ],
    [
      q(
        "What type of event is being arranged?",
        "A board election",
        "A training session",
        "A press conference",
        "An award ceremony",
        "B",
        "소프트웨어 교육을 열 장소를 찾고 있습니다.",
      ),
      q(
        "Look at the graphic. Which room does the woman select?",
        "Alder",
        "Birch",
        "Cedar",
        "Dogwood",
        "C",
        "Cedar만 9시 전 입실, 12석 이상, 프로젝터 조건을 모두 충족합니다.",
      ),
      q(
        "What will the woman do before the participants arrive?",
        "Test equipment",
        "Arrange more seating",
        "Distribute a survey",
        "Collect a rental fee",
        "A",
        "8시 45분까지 문을 열어 주면 프로젝터를 미리 시험하겠다고 합니다.",
      ),
    ],
    "room-comparison",
    "방 비교표: Alder 8:00 10석 프로젝터 있음, Birch 9:30 16석 프로젝터 있음, Cedar 8:30 14석 프로젝터 있음, Dogwood 8:00 12석 프로젝터 없음.",
  ),
  group(
    [
      [
        "rms",
        "I noticed the exhibitors at our last craft show kept asking where they could plug in their payment terminals. The floor plan only showed booth numbers.",
      ],
      [
        "slt",
        "The facilities team can mark every outlet on the new plan. The tricky part is deciding which booths should get priority.",
      ],
      [
        "rms",
        "Let us give the booths nearest the outlets to exhibitors who requested electricity on their application. After that we can send the remaining exhibitors a list of available spots.",
      ],
      ["slt", "I will email facilities about the markings first."],
    ],
    [
      q(
        "What issue did exhibitors raise at a previous event?",
        "A shortage of printing materials",
        "A lack of clear information on electrical outlets",
        "A delay in booth construction",
        "A missing application form",
        "B",
        "결제기 전원 연결 위치를 찾기 어려웠다고 합니다.",
      ),
      q(
        "Who will receive priority in booth assignments?",
        "Exhibitors who applied first",
        "Exhibitors who do not need much space",
        "Exhibitors who requested power",
        "Exhibitors who took part last year",
        "C",
        "신청서에서 전기 사용을 요청한 전시자에게 콘센트 근처 부스를 우선 배정합니다.",
      ),
      q(
        "What will the woman do first?",
        "Write to the facilities team",
        "Move a payment terminal",
        "Allocate the largest booth",
        "Send a plan to all exhibitors",
        "A",
        "시설팀에 콘센트 표시에 관해 먼저 메일을 보내겠다고 합니다.",
      ),
    ],
  ),
];

export const PART_4 = [
  group(
    [
      [
        "slt",
        "Good afternoon, Wilson Studio tenants. A plumbing inspection will take place this Wednesday from eight to ten in the morning. During that time, the restrooms near the south stairs will be closed. Please use the facilities beside the freight elevator on the second floor instead. Morning classes and deliveries will continue as scheduled. There is no need to move any equipment unless you have left it in the hallway next to the south stairs. If you have questions about access, contact the building office by Tuesday afternoon.",
      ],
    ],
    [
      q(
        "What is the main purpose of the announcement?",
        "To explain a temporary closure",
        "To announce a new delivery schedule",
        "To describe a change in office hours",
        "To introduce a building manager",
        "A",
        "배관 점검 때문에 일부 화장실이 수요일 오전에 일시 폐쇄된다고 공지합니다.",
      ),
      q(
        "What alternative location is mentioned?",
        "The building office",
        "The classroom corridor",
        "The area beside the freight elevator",
        "The south stairs",
        "C",
        "2층 화물 엘리베이터 옆 화장실을 대신 사용하라고 합니다.",
      ),
      q(
        "Who may need to move equipment?",
        "Anyone who teaches a morning class",
        "Anyone expecting a delivery",
        "Tenants using the freight elevator",
        "People who left items in one hallway",
        "D",
        "남쪽 계단 옆 복도에 장비를 놓아둔 사람만 옮기면 됩니다.",
      ),
    ],
  ),
  group(
    [
      [
        "rms",
        "Hello, this is Andre from the Westmere Bicycle Workshop. I started the service on your bicycle this morning. The rear wheel is ready, but the replacement brake cable that arrived today is too short for this model. We have another one coming tomorrow. I can still have the whole bicycle ready by five tomorrow, rather than noon as we originally agreed. If you need to ride somewhere before then, we can lend you a shop bicycle for the day. Please call me before six if you would like me to reserve one.",
      ],
    ],
    [
      q(
        "Why is the speaker calling?",
        "To describe a delay in service",
        "To advertise a new bicycle model",
        "To confirm a price for a wheel",
        "To request an address",
        "A",
        "브레이크 케이블 문제 때문에 수리 완료 시각이 내일 정오에서 오후 5시로 늦어졌다고 알립니다.",
      ),
      q(
        "What was wrong with the delivered part?",
        "It was damaged.",
        "It was too short.",
        "It was the wrong color.",
        "It was difficult to remove.",
        "B",
        "도착한 브레이크 케이블이 해당 모델에 쓰기에는 너무 짧았습니다.",
      ),
      q(
        "What can the listener receive temporarily?",
        "A new rear wheel",
        "A ride home",
        "A loan bicycle",
        "A delivery voucher",
        "C",
        "그 전에 이동이 필요하면 가게 자전거를 하루 빌려 줄 수 있다고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "Welcome to the Northbridge Community Conference. You can collect your badge now. If this is your first visit, notice that the morning sessions are arranged in pairs. The session on reducing household waste has moved out of the main hall because its speaker needs a sink for a demonstration. It is still in the first time slot. The other sessions are in the rooms printed on your program. Anyone who needs an accessible entrance should speak to the volunteer wearing a yellow ribbon beside the registration desk.",
      ],
    ],
    [
      q(
        "What should listeners collect now?",
        "A demonstration kit",
        "A name badge",
        "A conference survey",
        "A parking sticker",
        "B",
        "안내 첫머리에 지금 이름표를 받을 수 있다고 합니다.",
      ),
      q(
        "Why has a session changed rooms?",
        "A larger audience is expected.",
        "A volunteer requested a quieter room.",
        "A speaker needs a particular facility.",
        "A different time is more convenient.",
        "C",
        "가정 폐기물 줄이기 세션 발표자가 시연용 싱크대를 필요로 합니다.",
      ),
      q(
        "Look at the graphic. Where will the session on reducing household waste take place?",
        "Riverside Hall",
        "Oak Room",
        "Maple Room",
        "Studio Kitchen",
        "D",
        "첫 시간대에 열리고 싱크대가 필요하므로 시설 표에서 싱크대가 있는 Studio Kitchen을 찾아야 합니다.",
      ),
    ],
    "conference-room-facilities",
    "회의장 시설 표: Riverside Hall은 무대, Oak Room은 화상 회의 장비, Maple Room은 화이트보드, Studio Kitchen은 싱크대와 조리대.",
  ),
  group(
    [
      [
        "kal",
        "Today I will demonstrate our revised packing method for glass jars. Instead of filling all the gaps with loose material, use the cardboard inserts beside your station. Put a divider across the bottom, set the jars into the openings, and place the second divider on top. A trial last month showed that this method takes a little longer, but the number of damaged jars fell by more than half. For the first week, write the number of boxes you prepare on the sheet at the end of your shift.",
      ],
    ],
    [
      q(
        "Who is most likely listening?",
        "Restaurant customers",
        "Packaging employees",
        "Delivery drivers",
        "Equipment buyers",
        "B",
        "작업대에서 유리병을 상자에 포장하는 방법을 시연하므로 포장 직원이 청자입니다.",
      ),
      q(
        "What did the trial show?",
        "Packing materials cost less.",
        "Customers placed larger orders.",
        "Workers completed the job faster.",
        "Fewer jars were damaged.",
        "D",
        "포장 시간은 조금 늘었지만 파손된 병 수가 절반 이상 줄었습니다.",
      ),
      q(
        "What should listeners record?",
        "The number of boxes packed",
        "The time of a delivery",
        "The size of each jar",
        "The cost of a divider",
        "A",
        "첫 주 동안 근무가 끝날 때 포장한 상자 수를 기록하라고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "This is the second stop on the East Canal walking tour. The stone arch on the left supported the entrance to a flour warehouse. Its doors faced the canal so grain could be unloaded directly from barges. You may notice a thin dark line across the wall. That line shows how high the water reached during an unusually wet winter. Please stay with the group when we cross the footbridge. On the opposite bank we will visit a restored loading shed, where you can see the original scales.",
      ],
    ],
    [
      q(
        "What was the building originally used for?",
        "Storing flour",
        "Repairing bridges",
        "Making scales",
        "Selling boats",
        "A",
        "돌 아치가 있던 건물은 원래 밀가루 창고였습니다.",
      ),
      q(
        "What does the dark line indicate?",
        "Where a door once stood",
        "How high water once rose",
        "How far visitors may walk",
        "Where a wall was repaired",
        "B",
        "유난히 비가 많이 온 겨울의 최고 수위를 나타내는 표시입니다.",
      ),
      q(
        "What will listeners see at the next stop?",
        "A flour delivery",
        "A working barge",
        "Original scales",
        "A stone gate",
        "C",
        "다리 건너편 복원된 적재 창고에서 당시 저울을 관람한다고 합니다.",
      ),
    ],
  ),
  group(
    [
      [
        "rms",
        "It is time for a brief transit update. The city’s bus division will begin testing a separate boarding line at the Freeman Square stop next Monday. Riders purchasing tickets from the driver should wait under the blue sign. Riders using travel cards may join the shorter line beneath the green sign. The city will measure how long it takes for buses to leave the square during the morning commute. If waiting times fall, the new system may be introduced at three more stops this spring.",
      ],
    ],
    [
      q(
        "What will the city test?",
        "A different kind of ticket machine",
        "A new bus route",
        "Separate boarding lines",
        "A spring discount program",
        "C",
        "승차권 구입 승객과 교통카드 이용 승객을 분리해 줄을 운영하는 시험입니다.",
      ),
      q(
        "Where should riders with travel cards wait?",
        "Under a green sign",
        "Near the ticket office",
        "At the next stop",
        "Under a blue sign",
        "A",
        "교통카드 이용객은 초록색 표지 아래 짧은 줄에 서야 합니다.",
      ),
      q(
        "What might happen if the test is successful?",
        "The square will close to traffic.",
        "The system will expand to other locations.",
        "Bus fares will decrease.",
        "Morning buses will arrive less often.",
        "B",
        "대기 시간이 줄면 봄에 세 정류장으로 확대할 수 있습니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "You are listening to Local Business Brief. Maple Street Bakery has changed its spring delivery fee. The charge is now waived for orders of thirty dollars or more if customers choose the afternoon delivery window. There is still a fee for all morning deliveries. Customers collecting an order in person may now use the bakery’s side door, so they do not have to wait with shoppers buying items at the counter. The change begins tomorrow and is expected to continue until the end of May.",
      ],
    ],
    [
      q(
        "What is the report mainly about?",
        "A bakery’s new recipes",
        "Changes to a bakery’s order services",
        "An upcoming street festival",
        "A shortened store schedule",
        "B",
        "배달 요금 혜택과 직접 수령 장소 변경을 알립니다.",
      ),
      q(
        "What can qualify an order for free delivery?",
        "A morning appointment",
        "A purchase of any size",
        "An order meeting a minimum and arriving in the afternoon",
        "Collection from the side door",
        "C",
        "주문액 30달러 이상과 오후 배달을 모두 충족해야 배달료가 면제됩니다.",
      ),
      q(
        "Why should some customers use the side door?",
        "It is closer to the main bus stop.",
        "They can avoid the regular shopping line.",
        "They need to return a baking tray.",
        "It opens earlier than the main door.",
        "B",
        "픽업 고객은 계산대에서 물건을 사는 고객들과 줄을 설 필요가 없습니다.",
      ),
    ],
  ),
  group(
    [
      [
        "kal",
        "Thanks for coming to the weekly library planning meeting. The grant we received will pay for new chairs and table lamps in the study area. It will not cover computers, but we can keep the existing ones for another year. Before we order anything, I would like to know which lamp design readers prefer. We will put one of each sample on a table upstairs, and readers can vote by scanning the code beside it. I will bring the results to our next meeting.",
      ],
    ],
    [
      q(
        "What will not be bought with the grant?",
        "Table lamps",
        "Study chairs",
        "Computers",
        "Voting cards",
        "C",
        "보조금은 의자와 조명에 사용하며 컴퓨터에는 사용할 수 없습니다.",
      ),
      q(
        "What does the speaker want to learn from readers?",
        "Which design they prefer",
        "When they use the computers",
        "How far they travel",
        "Why they visit the library",
        "A",
        "샘플 중 독자들이 어떤 조명 디자인을 선호하는지를 알고 싶다고 합니다.",
      ),
      q(
        "How will readers vote?",
        "By calling the library",
        "By scanning a code",
        "By writing a letter",
        "By visiting a meeting",
        "B",
        "조명 샘플 옆의 코드를 스캔해 투표할 수 있습니다.",
      ),
    ],
  ),
  group(
    [
      [
        "slt",
        "Hello, calling all district sales teams. The replacement display stands are available today. Take one medium folding stand for each weekday location, as those displays must be carried through a narrow storeroom door. The River Market team is the exception. Its stand stays outside during events, and last year wind moved the old lightweight stand. I have left the stand codes with the order sheet. For River Market, select the only option described as weighted. Please use the sheet when you email your final order numbers this afternoon.",
      ],
    ],
    [
      q(
        "What is the purpose of the message?",
        "To request display stand orders",
        "To introduce new sales staff",
        "To announce a weather closure",
        "To rearrange a storeroom",
        "A",
        "각 영업팀에 조건에 맞는 진열대를 고르고 주문 번호를 보내라고 합니다.",
      ),
      q(
        "Why does one location have a special requirement?",
        "Its storeroom is being repaired.",
        "Its staff have a limited budget.",
        "Its display is used outdoors.",
        "Its order is due sooner.",
        "C",
        "River Market 진열대는 밖에 두며 지난해 바람에 가벼운 진열대가 움직였습니다.",
      ),
      q(
        "Look at the graphic. Which stand should River Market order?",
        "Model F12",
        "Model F25",
        "Model W30",
        "Model P18",
        "C",
        "표에서 weighted라고 명시된 유일한 진열대는 W30입니다.",
      ),
    ],
    "display-stands",
    "진열대 표: F12 소형 접이식, F25 중형 접이식, W30 중형 무게추 내장, P18 중형 고정 선반.",
  ),
  group(
    [
      [
        "rms",
        "May I have your attention, members of the evening photography class? The exhibition is still scheduled to open on the second of June. However, the gallery staff now need the final image files by the twenty-third of May, two days earlier than planned. Please put your full name and the artwork title in the file name, not in the picture itself. Next week we will spend part of class checking image sizes together. If you cannot attend, send me your file before class and I can check it for you.",
      ],
    ],
    [
      q(
        "Who is the announcement for?",
        "Art gallery employees",
        "A photography class",
        "Exhibition visitors",
        "Computer repair staff",
        "B",
        "저녁 사진 수업 수강생을 대상으로 공지합니다.",
      ),
      q(
        "What has changed?",
        "The exhibition opening date",
        "The format for naming the artwork",
        "The deadline for image files",
        "The location of the next class",
        "C",
        "전시 개막일은 그대로지만 최종 이미지 제출 마감이 이틀 앞당겨졌습니다.",
      ),
      q(
        "What will the class do next week?",
        "Pick a new exhibition date",
        "Compare camera prices",
        "Check the size of images",
        "Reserve gallery space",
        "C",
        "다음 주 수업에서 이미지 크기를 함께 확인할 예정입니다.",
      ),
    ],
  ),
];

export const LC_SOURCE = [PART_1, PART_2, PART_3, PART_4];
