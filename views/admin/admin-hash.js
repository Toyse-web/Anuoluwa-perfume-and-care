import bcrypt from "bcrypt";

const admins = [
  { username: "Toysedevs", email: "olayonwatoyib05@gmail.com", password: "Anuoluwapo12" },
  { username: "Anuoluwa", email: "anuoluwapoadejare3@gmail.com", password: "secure456" }
];

async function hashAdmins() {
  for (const admin of admins) {
    const hash = await bcrypt.hash(admin.password, 10);
    console.log(`('${admin.username}', '${admin.email}', '${hash}'),`);
  }
}

hashAdmins();
