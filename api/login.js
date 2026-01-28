import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  try {
    const { password, mode } = JSON.parse(event.body);

    if (!password || !mode) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing credentials" }),
      };
    }

    // 1️⃣ Get system credential (only one row)
    const { data, error } = await supabase
      .from("system_credentials")
      .select("*")
      .eq("active", true)
      .limit(1)
      .single();

    if (error || !data) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "System credential not found" }),
      };
    }

    // 2️⃣ Validate password
    const isValid = await bcrypt.compare(password, data.password_hash);

    if (!isValid) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid password" }),
      };
    }

    // 3️⃣ Decide role by mode
    const isAdmin = mode === "admin";

    // 4️⃣ Generate JWT (8 hours)
    const token = jwt.sign(
      {
        is_admin: isAdmin ? "true" : "false",
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // 5️⃣ Return token
    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        role: isAdmin ? "admin" : "reader",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
}
