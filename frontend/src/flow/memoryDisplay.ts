import { pick } from "../preferences";

// Presentation aliases only: never change stored fields, values or source quotes.
const fields: [string, string, string[]][] = [
  ["名字", "Name", ["姓名", "name", "user name"]],
  ["猫的名字", "Cat name", ["猫名", "cat name", "cat's name"]],
  ["猫的年龄", "Cat age", ["猫龄", "cat age", "cat's age"]],
  ["宠物的名字", "Pet name", ["宠物名字", "宠物名", "pet name", "pet's name"]],
  ["宠物的年龄", "Pet age", ["宠物年龄", "pet age", "pet's age"]],
  ["年龄", "Age", ["age", "user age"]],
  ["喜欢的食物", "Favorite food", ["最喜欢的食物", "favorite food", "favourite food"]],
  ["喜好", "Preference", ["偏好", "preference"]],
  ["过敏", "Allergy", ["过敏原", "allergy", "allergies"]],
  ["职业", "Occupation", ["occupation", "job"]],
  ["居住地", "Location", ["location", "city"]],
];

export function memoryField(field: string): string {
  const normalized = field.trim().toLowerCase().replace(/[_\s]+/g, " ");
  const match = fields.find(([zh, en, aliases]) =>
    [zh, en.toLowerCase(), ...aliases].includes(normalized));
  return match ? pick(match[0], match[1]) : field;
}

export function memoryValue(field: string, value: string): string {
  const label = memoryField(field);
  if (!/(?:年龄|猫龄|age)/i.test(label)) return value;
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const chinese = value.trim().match(/^(\d+|[零一二两三四五六七八九十])\s*岁$/);
  const english = value.trim().match(/^(\d+)\s*years?\s*(?:old)?$/i);
  const age = chinese ? (digits[chinese[1]] ?? Number(chinese[1])) : english ? Number(english[1]) : null;
  return age == null ? value : pick(`${age}岁`, `${age} ${age === 1 ? "year" : "years"} old`);
}
