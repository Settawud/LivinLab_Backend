// Generate a random admin signup secret for ADMIN_SIGNUP_SECRET
import { randomBytes } from "crypto";

const secret = randomBytes(64).toString("hex");
console.log(secret);

