import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('categories')
@Unique(['name'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Self-referencing tree (M13, plan_v2.md Part F): nullable so top-level categories need no
  // sentinel row; `SET NULL` on delete promotes orphaned children to top-level rather than
  // cascading a delete through the whole subtree.
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
