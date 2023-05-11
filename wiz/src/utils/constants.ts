import dotenv from "dotenv";

dotenv.config();

export const OPENAI_KEY = process.env['OPENAI_KEY'];
export const OPENAI_ORG = process.env['OPENAI_ORG'];