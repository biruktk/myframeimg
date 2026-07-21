export type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  featured_image: string;
  meta_title: string;
  meta_description: string;
  status: string;
  created_at: string;
  updated_at?: string;
};

export const defaultBlogPosts: BlogPost[] = [
  {
    id: 1,
    title: "Why families are moving photo sharing back into the home",
    slug: "families-photo-sharing-back-home",
    excerpt:
      "Phones hold thousands of images, but the moments that matter rarely stay visible. MyFrame is built to make meaningful family photos part of daily life at home.",
    body:
      '<p class="blog-lead">We take more family photos than any generation before us. The hard part is not capture-it is keeping the right images present in the rhythm of home life.</p>\n<figure class="blog-figure"><img src="/assets/hero-family-banner.webp" alt="MyFrame family photo display in a living space"></figure>\n<h2>From camera roll to living room</h2>\n<p>MyFrame pairs a paper-like e-paper display with a mobile workflow designed for busy families. Children, parents, and grandparents do not need another complicated feed; they need a quiet surface that shows the people they love.</p>\n<h2>Designed for distance and togetherness</h2>\n<p>Whether relatives live across the city or across time zones, new moments can land on the frame without asking everyone to open the same app every day. The product story is simple: one connected display, private family albums, and instant delivery when you send a photo.</p>\n<h2>No subscription story for everyday use</h2>\n<p>MyFrame is positioned as a one-time hardware purchase for normal family use-no required monthly plan to keep memories on the wall. That makes it a strong gift for parents and grandparents who should not be asked to manage another subscription.</p>\n<p><strong>Bottom line:</strong> MyFrame exists so the photos you already treasure become part of the home again-not buried three scrolls deep in a gallery.</p>',
    featured_image: "/assets/hero-family-banner.webp",
    meta_title: "Why families move photo sharing home | MyFrame",
    meta_description:
      "How MyFrame connected frames help families keep meaningful photos visible at home with calm e-paper displays and private sharing.",
    status: "publish",
    created_at: "2026-05-06T21:55:33.000Z",
  },
  {
    id: 2,
    title: "Inside MyFrame: Spectra 6 e-paper and a calmer photo experience",
    slug: "myframe-spectra-six-e-paper-experience",
    excerpt:
      "A closer look at the Spectra 6 colour e-paper pipeline in MyFrame products: gentle colour, low refresh power, and a display that feels closer to print than to a tablet.",
    body:
      '<p class="blog-lead">Consumer displays are bright, punchy, and attention-seeking. MyFrame takes a different path: a large-format e-paper canvas that behaves more like a framed print that updates when your family sends something new.</p>\n<figure class="blog-figure"><img src="/assets/hero-wedding-banner.webp" alt="MyFrame frame showing a wedding photo in a home setting"></figure>\n<h2>Why e-paper fits the product</h2>\n<p>Spectra 6 technology brings a wide colour range with a matte, paper-like surface. There is no backlight competing with room lighting, which makes long viewing easier in living rooms, hallways, and bedside tables.</p>\n<h2>Power that matches the use case</h2>\n<p>Unlike LCD panels that draw power continuously, e-paper uses energy when the image changes. For a family frame that updates when new photos arrive-rather than playing video 24/7-that profile supports long battery life on portable models and a calm "always there" feel on larger wall units.</p>\n<h2>Product lineup context</h2>\n<p>MyFrame ships multiple sizes-from compact desk-friendly frames to a 13.3&quot; family-room format. Each shares the same story: private sharing tools, SD support where models allow, and connectivity options aligned with how families already use Wi-Fi and mobile apps.</p>\n<p><strong>Takeaway:</strong> MyFrame is not trying to be another smart TV. It is a dedicated memory surface-hardware and software built together so family photography feels natural in the home.</p>',
    featured_image: "/assets/hero-wedding-banner.webp",
    meta_title: "MyFrame Spectra 6 e-paper experience",
    meta_description:
      "Technical and product notes on MyFrame's Spectra 6 e-paper displays, colour behaviour, and why the experience is tuned for long viewing at home.",
    status: "publish",
    created_at: "2026-05-06T21:55:33.000Z",
  },
];

export function publishedBlogs(posts: Array<Record<string, unknown>> = defaultBlogPosts) {
  return posts
    .filter((post) => String(post.status ?? "publish") === "publish")
    .sort((a, b) => Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")));
}
