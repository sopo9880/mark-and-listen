export const LETTERS = ['A','B','C','D'];
const lc = (id,question,choices,answer,explanation) => ({id,part:2,section:'LC',question,choices,answer,explanation,audio:`/audio/${id}.mp3`});
const rc = (id,question,choices,answer,explanation) => ({id,part:5,section:'RC',question,choices,answer,explanation});
export const BANK = [
  lc('lc1','When will the replacement badges arrive?',['By next Tuesday.','In the reception area.','I already wore mine.'],0,'When은 시간을 묻습니다. 다음 주 화요일까지 도착한다는 A가 자연스럽습니다.'),
  lc('lc2','Could you send me the revised budget this morning?',['The office opens at nine.','Of course. I will email it before lunch.','Yes, the printer is out of paper.'],1,'요청에 동의하고 보낼 방법과 시간을 알려 주는 B가 맞습니다.'),
  lc('lc3','Why was the afternoon tour canceled?',['There are six people on the tour.','It starts near the entrance.','The guide was called to another site.'],2,'Why는 이유를 묻습니다. 가이드가 다른 현장에 호출됐다는 C가 이유입니다.'),
  lc('lc4','Is the loading area behind the building or next to the lobby?',['It is behind the building.','I already loaded the last box.','Let us meet after lunch.'],0,'두 위치 중 하나를 고르는 선택 의문문입니다. A는 건물 뒤라는 위치를 알려 줍니다.'),
  lc('lc5','Who is leading the new employee orientation?',['On the second floor.','Renata from Human Resources.','About thirty minutes.'],1,'Who는 사람을 묻습니다. 인사팀의 Renata라고 알려 주는 B가 답입니다.'),
  lc('lc6','Would you mind closing the conference room door?',['It is a new conference room.','No, the meeting is tomorrow.','Not at all. I will close it now.'],2,'Would you mind ~?는 정중한 부탁입니다. Not at all은 여기서 거절이 아니라 수락입니다.'),
  rc('rc1','Each supplier must _____ a sample before Friday.',['submit','submits','submitted','submitting'],0,'조동사 must 뒤에는 동사원형 submit이 옵니다.'),
  rc('rc2','The conference room is _____ for meetings after two.',['available','availability','availably','avail'],0,'be동사 is 뒤에서 회의실의 상태를 나타내는 형용사 available이 필요합니다.'),
  rc('rc3','Please notify Mia _____ the shipment is delayed.',['unless','if','despite','during'],1,'지연될 경우에만 알려 달라는 조건이므로 if가 맞습니다. despite와 during 뒤에는 보통 명사구가 옵니다.'),
  rc('rc4','All travel requests must be approved _____ the department head.',['by','for','from','along'],0,'수동태에서 승인한 주체를 나타낼 때 by를 씁니다.'),
  rc('rc5','The technician finished the inspection _____ than expected.',['early','earliest','earlier','most early'],2,'than과 연결되는 비교급 earlier가 필요합니다.'),
  rc('rc6','Our online catalog provides a detailed _____ of every product.',['describe','descriptive','descriptively','description'],3,'a detailed 뒤, of 앞에 들어가는 자리는 명사 description입니다.'),
  rc('rc7','Be sure to save a backup copy _____ updating the software.',['before','among','until','despite'],0,'소프트웨어를 업데이트하기 전에 백업하라는 의미로 before가 자연스럽습니다.'),
  rc('rc8','The new branch will open _____ May 12.',['at','in','on','since'],2,'May 12 같은 특정 날짜 앞에는 전치사 on을 씁니다.'),
  rc('rc9','Neither of the proposed venues _____ enough space for the display.',['have','has','having','to have'],1,'이 문장의 정식 문법에서는 neither를 단수로 보고 동사 has와 일치시킵니다.'),
  rc('rc10','Since the renovation began in June, the library _____ several reading areas.',['adds','added','will add','has added'],3,'6월부터 현재까지의 변화를 나타내므로 주절에 현재완료 has added가 필요한 문장입니다.')
];
