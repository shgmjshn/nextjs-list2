'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import postgres from 'postgres';
import type { SignupState as State } from '../actions';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

// バリデーションスキーマ
const SignupSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

export async function signup(prevState: State, formData: FormData) {
  // バリデーション
  const validatedFields = SignupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid fields.',
    };
  }

  const { email, password } = validatedFields.data;
  
  try {
    // メールアドレスの重複チェック
    const existingUser = await sql`
      SELECT email FROM users WHERE email=${email}
    `;
    
    if (existingUser.length > 0) {
      return {
        message: 'User already exists with this email.',
      };
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザーの保存
    await sql`
      INSERT INTO users (email, password)
      VALUES (${email}, ${hashedPassword})
    `;

    return { message: 'User created successfully!' };
  } catch (error) {
    console.error('Signup Error:', error);
    return {
      message: 'Database Error: Failed to create user.',
    };
  }
} 