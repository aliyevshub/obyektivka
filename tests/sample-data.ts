import type { Resume } from "../src/layout";

// Uydirma namuna ma'lumotlar (testlar va namuna hujjatlar uchun)
export const SAMPLE: Omit<Resume, "script"> = {
  data: {
    fio: "Karimov Jasur Bahodir o'g'li",
    current_position: "Toshkent axborot texnologiyalari universiteti 3-bosqich sirtqi bo'lim talabasi",
    current_since: "2023",
    birth_date: "04.01.2004",
    birth_place: "Andijon shahar",
    nationality: "o'zbek",
    party: "yo'q",
    education: "tugallanmagan oliy",
    graduated: "TATU (kompyuter injiniringi)\n3-bosqich sirtqi bo'lim talabasi",
    specialty: "yo'q",
    degree: "yo'q",
    academic_title: "yo'q",
    languages: "Ingliz tili, rus tili",
    military_rank: "yo'q",
    awards: "yo'q",
    deputy: "yo'q",
  },
  work: [
    ["2021-2023 yy.", "Andijon shahar 12-umumta'lim maktabi laboranti"],
    ["2023 y. – h.v.", "\"Shams Soft\" MChJ dasturchisi"],
  ],
  relatives: [
    { relation: "Otasi", fio: "Karimov Bahodir Shavkatovich", birth: "1975 yil, Andijon shahar", work: "Andijon shahar 5-maktab o'qituvchisi", address: "Andijon shahar, Navoiy ko'chasi 12-uy" },
    { relation: "Onasi", fio: "Karimova Dilnoza Yusupovna", birth: "1979 yil, Andijon viloyati, Asaka tumani", work: "Uy bekasi", address: "Andijon shahar, Navoiy ko'chasi 12-uy" },
    { relation: "Ukasi", fio: "Karimov Sherzod Bahodir o'g'li", birth: "2009 yil, Andijon shahar", work: "Andijon shahar 12-maktab o'quvchisi", address: "Andijon shahar, Navoiy ko'chasi 12-uy" },
  ],
};
