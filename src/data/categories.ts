export type Category = { slug: string; name: string; shortName?: string; description: string; icon: string; featured: boolean };

export const categories: Category[] = [
  { slug: 'electronics', name: 'Electronics', description: 'Thoughtful picks for everyday tech, home connectivity and useful gadgets.', icon: '✳', featured: true },
  { slug: 'computers', name: 'Computers & accessories', shortName: 'Computers', description: 'Practical help choosing computers, peripherals and study essentials.', icon: '⌘', featured: true },
  { slug: 'home-kitchen', name: 'Home & kitchen', description: 'Useful ideas for cooking, organizing and making home life easier.', icon: '⌂', featured: true },
  { slug: 'household', name: 'Household essentials', description: 'Everyday cleaning and household choices, explained clearly.', icon: '◌', featured: true },
  { slug: 'fashion', name: 'Fashion & lifestyle', description: 'Considered accessories and practical everyday lifestyle finds.', icon: '◇', featured: true },
  { slug: 'personal-care', name: 'Personal care', description: 'Straightforward guidance for grooming and daily-care essentials.', icon: '✦', featured: true },
  { slug: 'books-education', name: 'Books & education', description: 'Resources and tools to support reading, learning and teaching.', icon: '▤', featured: true },
  { slug: 'gardening', name: 'Gardening & agriculture', description: 'Helpful equipment and ideas for gardens, balconies and small farms.', icon: '❋', featured: true },
  { slug: 'tools-home-improvement', name: 'Tools & home improvement', description: 'Clear buying guidance for repairs, projects and workshop basics.', icon: '⌁', featured: false },
  { slug: 'travel', name: 'Travel accessories', description: 'Useful, space-conscious gear for journeys near and far.', icon: '↗', featured: false },
  { slug: 'fitness-sports', name: 'Fitness & sports', description: 'Practical equipment choices for movement, training and play.', icon: '◎', featured: false },
  { slug: 'baby-family', name: 'Baby & family', description: 'Careful, research-led guidance for family essentials.', icon: '♡', featured: false },
];

export const categoryBySlug = (slug: string) => categories.find((category) => category.slug === slug);
