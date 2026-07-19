/**
 * Словарь для сборки предложений: части речи, категории и сочетаемость.
 *
 * Отдельно от [sentences.js](sentences.js) намеренно: там правила, здесь данные.
 * Данные собраны по самой колоде (1721 карточка) — слова не из этих списков
 * генератор просто не использует, и это нормально: лучше меньше предложений,
 * чем «Возраст розовый».
 *
 * Зачем вообще категории. Без них шаблон «Это {прил} {сущ}» выдаёт «Это очень
 * грустный тигр» и «Цена сухая»: грамматика верна, смысл — нет. Категория
 * отвечает на единственный вопрос, который нужен шаблону: с чем это слово
 * вообще может стоять рядом.
 */

/** Разворачивает «a b c» в Set — списки ниже читаются глазами, а не парсером. */
const set = (s) => new Set(s.split(/\s+/).filter(Boolean))

// ── Служебные слова ──────────────────────────────────────────────────────────

/**
 * Местоимения, предлоги, союзы, частицы, числительные, наречия. Ни одно
 * правило по окончанию их не отсеет: «хорошо» и «обычно» кончаются на -о ровно
 * как «окно», а «дети» — на -и ровно как «идти».
 */
export const CLOSED = set(`
  i you he she it we they me him her us them my your his its our their mine yours this that these those
  a an the and or but if because so then than as at in on of to for with from by about into over under
  after before between up down out off again very too also well just only now today tomorrow yesterday
  always never often usually sometimes seldom rarely together here there where when what who whom why how which
  yes no not please thanks thank hello hi bye goodbye welcome sorry hurray oh ah ok okay
  be am is are was were been being do does did done have has had having will would can could should must may might shall
  one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen
  eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million
  first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth twentieth
  everybody everyone everything everywhere someone somebody something somewhere nothing nowhere no-one nobody
  anybody anything anywhere many much more most few little other others another own any all both each every
  enough almost nearly perhaps probably maybe above behind below inside outside opposite near next while
  until since without instead during aloud alone early late soon forward backward back away upstairs downstairs
  literally especially definitely obviously differently quickly slowly loudly really quite even still already yet
`)

// ── Глаголы ──────────────────────────────────────────────────────────────────
//
// solo — глагол осмыслен без дополнения («Я хочу спать»).
// obj  — категории, которые годятся ему в дополнение; пусто — дополнения не даём.
// act  — действие, к которому можно призвать: «Давай работать!», «Пора идти».
//        «Давай помнить!» и «Пора терять» — уже нет, поэтому призывы не для всех.
//
// Без первого «Я хочу получать.» и «I want to get.» выходят одинаково
// оборванными, без второго «Я хочу есть машину» — одинаково нелепым.
//
// Безличных глаголов (происходить, светить, таять) в списке нет вовсе: все
// шаблоны построены от лица говорящего, а «Мы можем происходить» — не по-русски.

const GENERIC = ['thing', 'clothing', 'food', 'drink'] // всё, что можно взять в руки
const MIND = ['abstract'] // знать, помнить, понимать — про мысли, не про предметы
const LIVING = ['person', 'animal']

export const VERBS = {
  // ── самодостаточные ──
  work: { solo: 1, act: 1 }, live: { solo: 1 }, sleep: { solo: 1, act: 1 }, run: { solo: 1, act: 1 },
  walk: { solo: 1, act: 1 }, swim: { solo: 1, act: 1 }, dance: { solo: 1, act: 1 },
  travel: { solo: 1, act: 1 }, relax: { solo: 1, act: 1 }, rest: { solo: 1, act: 1 },
  smile: { solo: 1, act: 1 }, laugh: { solo: 1, act: 1 }, cry: { solo: 1 }, sneeze: { solo: 1 },
  cough: { solo: 1 }, sit: { solo: 1, act: 1 }, stand: { solo: 1, act: 1 }, fall: { solo: 1 },
  fly: { solo: 1, act: 1 }, jump: { solo: 1, act: 1 }, climb: { solo: 1, act: 1 },
  go: { solo: 1, act: 1 }, come: { solo: 1, act: 1 }, arrive: { solo: 1 },
  leave: { solo: 1, act: 1 }, return: { solo: 1, act: 1 }, stay: { solo: 1, act: 1 },
  wait: { solo: 1, act: 1 }, hurry: { solo: 1, act: 1 }, joke: { solo: 1 }, argue: { solo: 1 },
  complain: { solo: 1 }, worry: { solo: 1 }, dream: { solo: 1 }, think: { solo: 1 },
  hope: { solo: 1 }, react: { solo: 1 }, grow: { solo: 1 }, knock: { solo: 1 },
  survive: { solo: 1 }, oversleep: { solo: 1 }, 'wake up': { solo: 1, act: 1 },
  'get up': { solo: 1, act: 1 }, 'get dressed': { solo: 1, act: 1 }, 'sit down': { solo: 1, act: 1 },
  'stand up': { solo: 1, act: 1 }, 'lie down': { solo: 1, act: 1 }, 'go home': { solo: 1, act: 1 },
  'get lost': { solo: 1 },

  // ── и так, и с дополнением ──
  read: { solo: 1, act: 1, obj: ['text'] },
  write: { solo: 1, act: 1, obj: ['text'] },
  eat: { solo: 1, act: 1, obj: ['food'] },
  drink: { solo: 1, act: 1, obj: ['drink'] },
  cook: { solo: 1, act: 1, obj: ['food'] },
  sing: { solo: 1, act: 1, obj: ['music'] },
  draw: { solo: 1, act: 1, obj: ['thing', 'animal'] },
  paint: { solo: 1, act: 1, obj: ['thing'] },
  study: { solo: 1, act: 1 }, learn: { solo: 1, act: 1 }, practise: { solo: 1, act: 1 },
  practice: { solo: 1, act: 1 },
  clean: { solo: 1, act: 1, obj: ['thing', 'clothing', 'place'] },
  wash: { solo: 1, act: 1, obj: ['thing', 'clothing', 'food'] },
  count: { solo: 1, obj: GENERIC },
  drive: { solo: 1, act: 1, obj: ['vehicle'] },
  win: { solo: 1 }, lose: { solo: 1 }, pay: { solo: 1, act: 1 }, play: { solo: 1, act: 1 },
  listen: { solo: 1, act: 1 }, speak: { solo: 1 }, talk: { solo: 1, act: 1 },
  answer: { solo: 1, act: 1 }, ask: { solo: 1 },
  start: { solo: 1, act: 1 }, begin: { solo: 1, act: 1 }, finish: { solo: 1, act: 1 },
  continue: { solo: 1, act: 1 }, stop: { solo: 1, act: 1 },
  change: { solo: 1, obj: ['clothing', 'thing'] },
  help: { solo: 1, obj: LIVING },
  hide: { solo: 1, obj: GENERIC },
  share: { solo: 1, obj: ['food', 'drink', 'thing'] },
  sell: { solo: 1, obj: GENERIC },
  decide: { solo: 1 },
  believe: { solo: 1, obj: MIND },
  understand: { solo: 1, obj: MIND },
  remember: { solo: 1, obj: MIND },
  forget: { solo: 1, obj: MIND },
  try: { solo: 1, obj: ['food', 'drink'] },
  see: { obj: ['thing', 'animal', 'person', 'place'] },
  watch: { obj: ['show'] },
  hear: { obj: ['music'] },

  // ── только с дополнением ──
  buy: { obj: GENERIC },
  get: { obj: GENERIC },
  take: { obj: GENERIC },
  make: { obj: ['food', 'drink', 'thing'] },
  give: { obj: GENERIC },
  bring: { obj: GENERIC },
  send: { obj: ['text', 'thing'] },
  find: { obj: GENERIC },
  use: { obj: ['thing'] },
  open: { obj: ['openable'] },
  close: { obj: ['openable'] },
  shut: { obj: ['openable'] },
  put: { obj: GENERIC },
  keep: { obj: GENERIC },
  build: { obj: ['place'] },
  cut: { obj: ['food', 'thing'] },
  break: { obj: ['thing'] },
  fix: { obj: ['thing'] },
  repair: { obj: ['thing'] },
  meet: { obj: LIVING },
  visit: { obj: ['person', 'place'] },
  call: { obj: LIVING },
  invite: { obj: LIVING },
  feed: { obj: LIVING },
  protect: { obj: LIVING },
  teach: { solo: 1 }, // «преподавать тёщу» — дополнение тут только портит
  tell: { obj: ['text', 'abstract'] },
  show: { obj: ['thing', 'text'] },
  order: { obj: ['food', 'drink'] },
  prepare: { obj: ['food', 'thing'] },
  repeat: { obj: ['text', 'abstract'] },
  translate: { obj: ['text'] },
  know: { obj: MIND },
  catch: { obj: ['animal'] },
  hold: { obj: ['thing', 'food'] },
  carry: { obj: ['thing'] },
  save: { obj: ['thing', 'abstract'] },
  touch: { obj: ['thing', 'animal'] },
  throw: { obj: ['thing'] },
  wear: { obj: ['clothing'] },
  check: { obj: ['text', 'thing', 'abstract'] },
  collect: { obj: ['thing'] },
  borrow: { obj: ['thing', 'text'] },
  lend: { obj: ['thing', 'text'] },
  notice: { obj: ['thing', 'person'] },
  describe: { obj: ['abstract', 'thing'] },
  discuss: { obj: MIND },
  destroy: { obj: ['thing', 'place'] },
  ruin: { obj: ['thing', 'abstract'] },
  decorate: { obj: ['place', 'thing'] },
  deliver: { obj: ['thing', 'food'] },
  'look for': { obj: GENERIC },
  'put on': { obj: ['clothing'] },
  'take off': { obj: ['clothing'] },
  'turn on': { obj: ['thing'] },
  'turn off': { obj: ['thing'] },
  'heat up': { obj: ['food', 'drink'] },
  'pick up': { obj: ['thing'] },
}

/**
 * Модальные и «рамочные» глаголы: они и так стоят в каждом шаблоне, а внутри
 * дают чепуху вроде «Мне нужно хотеть иглу».
 */
export const NOT_INNER_VERB = set('want need like love hate can must may should be have do')

// ── Подкатегории для дополнений ──────────────────────────────────────────────
//
// Проверяются по английской стороне: их слишком мало, чтобы заводить отдельную
// категорию у каждого существительного.

export const SUBCATS = {
  /** «читать книгу», «написать письмо» */
  text: set(`book letter newspaper story essay composition dictionary postcard chapter word note poem
             article message name surname address question answer introduction`),
  /** «открыть коробку» — то, что вообще открывается и закрывается */
  openable: set(`door window box book bottle suitcase jar can bag handbag letter curtains blinds
                 laptop shop pharmacy supermarket restaurant museum`),
  vehicle: set('car bus train plane ship scooter trolley bike bicycle taxi'),
  music: set('song music guitar trumpet radio concert'),
  show: set('film movie play concert show cartoon match game news'),
}

// ── Прилагательные ───────────────────────────────────────────────────────────
//
// Класс отвечает на вопрос «к чему это лепится»:
//   thing — к любому предмету («новая книга», «красная машина»);
//   taste — только к еде и напиткам («вкусный суп», но не «вкусный шкаф»);
//   human — только к людям («усталый брат», но не «усталый стол»);
//   place — к местам и помещениям («уютная кухня»);
//   relative — не качественное, «очень» с ним не ставим («английский фильм»).

export const ADJ_CLASS = {
  /**
   * Оценка разбита мелко не из любви к порядку: «важный лук» и «скучные очки»
   * грамматически безупречны, и отсечь их можно только тем, к чему каждое из
   * этих слов вообще прикладывают.
   */
  goodness: set('good bad'),
  looks: set('beautiful pretty ugly attractive'),
  /** Про то, что смотрят, читают и посещают, а не про предметы. */
  interest: set(`interesting boring exciting amazing incredible wonderful relaxing important strange
                 weird unusual pleasant lovely`),
  value: set('expensive cheap valuable free fancy fake'),
  newness: set('new old modern'),
  comfort: set('comfortable convenient cozy cosy'),
  safety: set('safe dangerous'),
  bigness: set('big small little large'),
  /** Размеры по одной оси: у снежинки и еды их не меряют. */
  dimension: set('long short tall high low wide narrow'),
  /** Вес и толщина: у комнаты их не бывает — «тяжелый кабинет» отсюда и брался. */
  weight: set('heavy light thin thick'),
  colour: set('black white red green blue yellow orange pink purple brown grey gray'),
  temperature: set('hot cold warm cool'),
  wetness: set('wet dry clean dirty'),
  texture: set('soft bright dark full empty round square'),
  freshness: set('fresh'),
  speed: set('fast slow'),
  sound: set('loud quiet noisy'),
  /** Сложность — про то, что делают или читают, а не про предметы. */
  hardness: set('difficult easy hard simple'),
  fame: set('famous popular'),
  taste: set('tasty delicious disgusting sweet sour salty bitter'),
  // «handsome» сюда не берём: по-русски «красивый» подходит и сестре, а
  // «My sister is handsome» — нет.
  human: set(`happy sad angry tired hungry thirsty busy brave clever smart silly friendly kind polite
              rude lazy honest serious calm proud curious nervous naughty grumpy clumsy determined
              hostile young ready sure active successful upset weak strong`),
  relative: set('english italian french german russian american spanish chinese japanese'),
}

// ── Существительные ──────────────────────────────────────────────────────────
//
// Категория одна на слово. Размечено по колоде; чего в списке нет, генератор
// относит к «неизвестно» и пускает только в самые безобидные шаблоны.

export const NOUN_CATS = {
  person: set(`
    alien aunt brother child composer doctor driver fairy family father fellas friend friends
    grandfather grandkid grandmother guards guy guys hero human husband judge king librarian loser man
    mother mother-in-law musician neighbour nurse parents patient person pilot postman queen
    relatives sister son students teacher trespassers uncle waiter wife wizard`),
  animal: set(`
    bees birds creature deer dinosaur dog donkey fish fox goat louse monkey moose mouse penguin
    phoenix prawns salmon spider tiger toad wolf`),
  food: set(`
    apple apples beef berry biscuits borscht bread buckwheat caviar cheese crisps cucumber cutlets
    dish eggs food fruit honey lamb meal meat melon mushroom nuts oatmeal onion orange oranges
    pancakes pork porridge potato raspberry snack sugar tomato tomatoes treats vegetables watermelon`),
  drink: set(`
    juice milk tea water`),
  clothing: set(`
    bathrobe belt boot boots clothes coat dress glasses gloves hat hats jacket jeans jumper mittens
    pants raincoat sandals scarf shirt shoes skirt slippers sock socks suit t-shirt tights top
    trainers`),
  thing: set(`
    armchair ball basket bat bench blinders book box brush bus campfire candle car carpet ceiling
    chimney closet cloud concrete couch curtains decoration dictionary door dot duvet equipment
    feather fireplace floor flour flower furniture gift glass glitter grass guitar handbag hangers
    iron key keyboard keys knife laptop leaf letter matches medicine needle newspaper oven paper
    passport perfume photo photos picture pills pins plane plant plate postcard present radiator
    radio roof rope rubbish rug safe sand scales scooter seat ship sleigh snowflake spots stairs star
    statue sticks stuff suitcase tent thing ticket tickets towel toys train tree trolley trumpet
    umbrella wall wallpaper watch window windowsill wood`),
  /**
   * Кино, песни, тексты. Отдельно от «вещей» потому, что прилагательные к ним
   * лепятся другие: «интересный фильм» — да, «белое сочинение» и «широкий
   * фильм» — нет.
   */
  media: set(`
    chapter composition concert essay film lesson movie play song story`),
  place: set(`
    apartment attic balcony basement beach bedroom beijing bridge building campsite castle cathedral
    checkout church city country entrance flat forest france garage garden gym hall hospital
    house hut island kingdom kitchen lake laundry london market monument moscow mountain mountains
    museum office palace pantry paris park pharmacy place post restaurant river road shop sky
    sochi space square supermarket temple tower town village world yard`),
  body: set(`
    ankle arm back beard bottom cheek chin ears eye eyebrows eyelashes face foot forehead hand head
    heart knee leg legs lips moustache mouth neck nose paw shoulder shoulders stomach tail temples
    tooth waist wrist`),
  time: set(`
    age april august autumn christmas december eve february friday holiday holidays january july june
    march may monday morning! november october saturday september spring summer sunday thursday
    tuesday wednesday winter`),
  abstract: set(`
    access address advice answer beauty belief breed care challenge choice cough deal debt decision
    delivery expectation false flight flu grade harm hyphen imagination information introduction kind
    life light miracle name nature noise nonsense offer pain pair pleasure price queue question reason
    scar side size smell east north south soul sound space surgery surname taste team tour variety view way west word
    wound`),
}

/** Не носители категории вовсе: местоимения, наречия и прочий мусор разметки. */
export const NOT_NOUNS = set(`
    about above after again aloud already also always at before behind cloudy could cozy definitely
    differently downstairs early eight enjoy enough especially even everybody everyone everything
    everywhere for forever forward four from fun he hello here hi how hundred hurray i if in inside
    instead it late let's literally loudly many must near need never no-one nothing now nowhere
    obviously often on one opposite or others outside over perfect perhaps probably quickly rainy
    secondly seldom seven she should someone something sometimes somewhere sunny than then they this
    thousand three today together tomorrow too true two under upstairs usually we welcome! well what
    when where while who with without yesterday you`)

/** Категория существительного по английской стороне карточки. */
export function nounCategory(en) {
  const w = en.toLowerCase()
  for (const [cat, words] of Object.entries(NOUN_CATS)) if (words.has(w)) return cat
  return null
}

/** Подкатегория (text, openable, vehicle…) — их у слова может быть несколько. */
export function hasSubcat(en, sub) {
  return SUBCATS[sub]?.has(en.toLowerCase()) ?? false
}

/** Класс прилагательного; null — незнакомое, ставим только при существительном. */
export function adjClass(en) {
  const w = en.toLowerCase()
  for (const [cls, words] of Object.entries(ADJ_CLASS)) if (words.has(w)) return cls
  return null
}
