import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import AppDataSource from '../data-source';
import { User, UserRole } from '../entities/user.entity';
import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';

// Deterministic — same identities/catalog every run — and idempotent, so it
// is safe to run on every container start (upsert-by-natural-key, no
// duplicates on restart).
async function seed() {
  const ds = await AppDataSource.initialize();

  const userRepo = ds.getRepository(User);
  const categoryRepo = ds.getRepository(Category);
  const productRepo = ds.getRepository(Product);

  const users = [
    {
      name: 'Admin',
      email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
      password: process.env.ADMIN_PW ?? 'admin-pw-123',
      role: UserRole.ADMIN,
    },
    {
      name: 'Alice',
      email: process.env.USER_A_EMAIL ?? 'alice@example.com',
      password: process.env.USER_A_PW ?? 'alice-pw-123',
      role: UserRole.USER,
    },
    {
      name: 'Bob',
      email: process.env.USER_B_EMAIL ?? 'bob@example.com',
      password: process.env.USER_B_PW ?? 'bob-pw-123',
      role: UserRole.USER,
    },
  ];

  for (const u of users) {
    const existing = await userRepo.findOne({ where: { email: u.email } });
    if (existing) continue;
    const passwordHash = await bcrypt.hash(u.password, 10);
    await userRepo.save(
      userRepo.create({
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
      }),
    );
    console.log(`seeded user: ${u.email} (${u.role})`);
  }

  const categories = ['Electronics', 'Books', 'Home & Kitchen'];
  const categoryEntities: Record<string, Category> = {};
  for (const name of categories) {
    let cat = await categoryRepo.findOne({ where: { name } });
    if (!cat) {
      cat = await categoryRepo.save(categoryRepo.create({ name }));
      console.log(`seeded category: ${name}`);
    }
    categoryEntities[name] = cat;
  }

  const products = [
    { name: 'Wireless Mouse', category: 'Electronics', price: '19.99', stock: 100 },
    { name: 'Mechanical Keyboard', category: 'Electronics', price: '79.99', stock: 40 },
    { name: 'The Pragmatic Programmer', category: 'Books', price: '34.50', stock: 25 },
    { name: 'Clean Code', category: 'Books', price: '29.99', stock: 30 },
    { name: 'French Press', category: 'Home & Kitchen', price: '24.00', stock: 60 },
  ];

  for (const p of products) {
    const existing = await productRepo.findOne({ where: { name: p.name } });
    if (existing) continue;
    await productRepo.save(
      productRepo.create({
        name: p.name,
        description: `${p.name} — seeded catalog item`,
        price: p.price,
        stock: p.stock,
        categoryId: categoryEntities[p.category].id,
      }),
    );
    console.log(`seeded product: ${p.name}`);
  }

  await ds.destroy();
  console.log('seed complete');
}

seed().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
