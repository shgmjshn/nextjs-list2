'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import bcrypt from 'bcrypt';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require'});

// バリデーションスキーマ
const SignupSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    email: z.string().email({ message: 'Invalid email address'}),
    password: z.string().min(6, { message: 'Password must be at least 6 characters long'})
});

export type SignupState = {
    errors?: {
        name?: string[];
        email?: string[];
        password?: string[];
    }
    message?: string;
};

export async function signup(prevState: SignupState, formData: FormData) {
    // バリデーション
    const validatedFields = SignupSchema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Invalid fields.',
        }
    }

    const { name, email, password } = validatedFields.data;

    try {
        // ユーザー名の重複チェック
        const existingUsername = await sql`
            SELECT name FROM users WHERE name=${name}
        `;

        if (existingUsername.length > 0) {
            return {
                message: 'User already exists with this name.',
            };
        }

        // メールアドレスの重複チェック
        const existingEmail = await sql`
           SELECT email FROM users WHERE email=${email}
        `;

        if (existingEmail.length > 0) {
            return {
                message: 'User already exists with this email.',
            };
        }

        // パスワードのハッシュ化
        const hashedPassword = await bcrypt.hash(password, 10);

        // ユーザーの保存
        await sql`
          INSERT INTO users (name, email, password)
          VALUES (${name}, ${email}, ${hashedPassword})
        `;

        redirect('/login');
    } catch (_error) {
        console.error('Signup Error:', _error);
        return {
            message: 'Database Error: Failed to create user.',
        };
    }
}

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error: 'Please select a customer'
    }),
    amount: z.coerce
    .number()
    .gt(0, {
        message: 'Please enter an amount greater than $0'
    }),
    status: z.enum(['pending', 'paid'], {
        invalid_type_error: 'Please select an invoice status'
    }),
    data: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, data: true });
const Updateinvoice = FormSchema.omit({ id: true, data: true});

export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
  };

export async function createInvoice(prevState: State, formData: FormData) {
    // Validate form fields using Zod
    const validatedFields = CreateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    // If form validation failds, return errors early. Otherwise, continue.
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Create invoice.',
        }
    }

    // Prepare data for insertion into the databese
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;
    const date = new Date().toISOString().split('T')[0];

    // Insert data into the database
    try {
    await sql `
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
} catch (error) {
    console.error('Error:', error);
    return {
        message: 'Database Error: Failed to Create Invoice.',
    };
}

    // Revalidate the cache for the invoices page and redirect the user.
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function updateInvoice(
    id: string, 
    prevState: State,
    formData: FormData
) {
    const validatedFields = Updateinvoice.safeParse({
        customerId: formData.get('custmerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Missing Fields. Failed to Update Invoice.'
        };
    }

    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;

    try {
    await sql`
      UPDATE invoice
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
    } catch (error) {
        return {
            message: 'Database Error: Failed to Update Invoice'
        };
    }
    
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
    throw new Error('Failed to Delete Invoice');

    //Unreachable code block
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
  }

  export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
  ) {
    try {
        await signIn('credentials', formData);
    }catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials';
                default:
                    return 'Something went wrong';
            }
        }
        throw error;
    }
  }