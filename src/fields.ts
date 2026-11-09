// Obyektivka savollari: bot ularni shu tartibda so'raydi.

export interface Field {
  key: string;
  prompt: string;
  /** Tezkor javob tugmalari */
  options?: string[];
  example?: string;
}

export const NONE = "yo'q";

export const FIELDS: Field[] = [
  { key: "fio", prompt: "Familiya, ism va otangizning ismini kiriting.", example: "Aliyev Abdulhamid Furqat o'g'li" },
  {
    key: "current_position",
    prompt: "Hozirgi ish (o'qish) joyingiz va lavozimingiz.",
    options: ["Vaqtincha ishlamaydi"],
    example: "Andijon davlat universiteti 3-kurs talabasi",
  },
  {
    key: "current_since",
    prompt: "Shu joyda qaysi yildan beri ishlaysiz (o'qiysiz)?",
    options: ["O'tkazib yuborish"],
    example: "2023",
  },
  { key: "birth_date", prompt: "Tug'ilgan sanangiz.", example: "04.01.2006" },
  { key: "birth_place", prompt: "Tug'ilgan joyingiz.", example: "Andijon shahar" },
  { key: "nationality", prompt: "Millatingiz.", options: ["o'zbek", "qoraqalpoq", "tojik", "rus"] },
  { key: "party", prompt: "Partiyaviyligingiz.", options: [NONE] },
  { key: "education", prompt: "Ma'lumotingiz.", options: ["oliy", "tugallanmagan oliy", "o'rta maxsus", "o'rta"] },
  {
    key: "graduated",
    prompt: "Qaysi o'quv yurtini tamomlagansiz (yoki o'qiyapsiz)? Bir nechta bo'lsa, har birini yangi qatorda yozing.",
    example: "2023 yil, Andijon davlat universiteti",
  },
  { key: "specialty", prompt: "Ma'lumoti bo'yicha mutaxassisligingiz.", options: [NONE], example: "Kompyuter injiniringi" },
  { key: "degree", prompt: "Ilmiy darajangiz.", options: [NONE] },
  { key: "academic_title", prompt: "Ilmiy unvoningiz.", options: [NONE] },
  {
    key: "languages",
    prompt: "Qaysi chet tillarini bilasiz?",
    options: [NONE, "rus tili", "ingliz tili", "ingliz tili, rus tili"],
  },
  { key: "military_rank", prompt: "Harbiy (maxsus) unvoningiz.", options: [NONE] },
  { key: "awards", prompt: "Davlat mukofotlari bilan taqdirlanganmisiz (qanaqa)?", options: [NONE] },
  {
    key: "deputy",
    prompt: "Xalq deputatlari Kengashi deputati yoki boshqa saylanadigan organ a'zosimisiz?",
    options: [NONE],
  },
];

export const RELATIONS = [
  "Otasi", "Onasi", "Akasi", "Ukasi", "Opasi", "Singlisi",
  "Turmush o'rtog'i", "O'g'li", "Qizi", "Qaynotasi", "Qaynonasi",
];

export const RELATIVE_FIELDS: Field[] = [
  { key: "relation", prompt: "Qarindoshingiz kim? Tugmani tanlang yoki o'zingiz yozing.", options: RELATIONS },
  { key: "fio", prompt: "Uning familiyasi, ismi va otasining ismi.", example: "Aliyev Furqat Abdullayevich" },
  { key: "birth", prompt: "Tug'ilgan yili va joyi.", example: "1978 yil, Andijon shahar" },
  {
    key: "work",
    prompt: "Ish joyi va lavozimi. Nafaqada bo'lsa yoki vafot etgan bo'lsa, shuni yozing.",
    options: ["Nafaqada", "Uy bekasi", "Talaba", "O'quvchi"],
    example: "Andijon shahar 5-maktab o'qituvchisi",
  },
  { key: "address", prompt: "Turar joyi.", example: "Andijon shahar, Navoiy ko'chasi 12-uy" },
];
