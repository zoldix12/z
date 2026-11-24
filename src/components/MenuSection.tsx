/**
 * قسم قائمة الطعام الكاملة مع المفضلة وتصفية الأصناف وتعديلات الإدارة المباشرة.
 */
import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Heart, ImagePlus, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { MenuItem, OrderableProduct } from '../types/menu';
import { FoodImage } from './FoodImage';

interface MenuSectionProps {
  countByItemId: Record<string, number>;
  onSelectProduct: (product: OrderableProduct) => void;
  onQuickAdd: (product: OrderableProduct) => void;
}

export const MenuSection: React.FC<MenuSectionProps> = ({
  countByItemId,
  onSelectProduct,
  onQuickAdd,
}) => {
  const { siteConfig, favorites, toggleFavorite, auth, isEditMode, setDraftConfig } = useSite();
  const categories = siteConfig.categories;
  const menuItems = siteConfig.items;
  const currency = siteConfig.restaurant.currency;

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const isSectionEditable =
    (auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode;

  const favoriteProducts = useMemo(() => {
    const all: OrderableProduct[] = [...siteConfig.offers, ...siteConfig.items];
    return all.filter((p) => favorites.includes(p.id));
  }, [siteConfig.offers, siteConfig.items, favorites]);

  const visibleGroups = useMemo(() => {
    if (activeCategory === 'all') {
      return categories
        .map((cat) => ({
          category: cat,
          items: menuItems.filter((item) => item.categoryId === cat.id),
        }))
        .filter((group) => group.items.length > 0 || isSectionEditable);
    }
    const found = categories.find((c) => c.id === activeCategory);
    if (!found) return [];
    return [
      {
        category: found,
        items: menuItems.filter((item) => item.categoryId === found.id),
      },
    ];
  }, [activeCategory, categories, menuItems, isSectionEditable]);

  const handleAddCategory = () => {
    const newCat = {
      id: `cat_${Date.now()}`,
      name: 'قسم جديد',
    };
    setDraftConfig((p) => ({ ...p, categories: [...p.categories, newCat] }));
    setActiveCategory(newCat.id);
  };

  const handleAddItemToCategory = (categoryId: string) => {
    const newItem: MenuItem = {
      id: `item_${Date.now()}`,
      categoryId,
      name: 'وجبة جديدة',
      description: 'وصف شهي محضر طازجاً على الفحم',
      price: 4.5,
      image: '/images/zoldix-signature.jpg',
      addonIds: [],
    };
    setDraftConfig((p) => ({ ...p, items: [newItem, ...p.items] }));
  };

  const renderCard = (item: OrderableProduct, isEditableAllowed = true) => {
    const countInCart = countByItemId[item.id] || 0;
    const isFav = favorites.includes(item.id);
    const hasOptions =
      (item.variantIds && item.variantIds.length > 0) ||
      (item.addonIds && item.addonIds.length > 0);
    const editable =
      isEditableAllowed &&
      (auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) &&
      isEditMode;
    const itemIndex = menuItems.findIndex((m) => m.id === item.id);

    return (
      <motion.article
        key={item.id}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.25 }}
        whileHover={{ y: editable ? 0 : -3 }}
        onClick={() => {
          if (!editable) onSelectProduct(item);
        }}
        className={`group flex flex-col justify-between rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] overflow-hidden shadow-[var(--shadow-card)] ${
          editable ? 'ring-1 ring-[var(--accent-gold)]/50' : 'cursor-pointer'
        }`}
      >
        <div>
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-subtle)]">
            <FoodImage
              src={item.image}
              alt={item.name}
              className="w-full h-full group-hover:scale-[1.04] transition-transform duration-300"
            />
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(item.id);
                }}
                aria-label={isFav ? `إزالة ${item.name} من المفضلة` : `إضافة ${item.name} للمفضلة`}
                className="w-9 h-9 rounded-xl bg-black/55 safari-blur border border-white/15 flex items-center justify-center text-white hover:scale-105 transition-transform"
              >
                <Heart
                  className={`w-4 h-4 ${
                    isFav ? 'fill-[var(--accent-fire)] text-[var(--accent-fire)]' : 'text-white'
                  }`}
                />
              </button>

              {countInCart > 0 && (
                <div className="rounded-xl bg-[var(--accent-gold)] text-[#13100E] px-2.5 py-1 text-xs font-black shadow-md tabular-nums">
                  بالسلة {countInCart}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {editable && itemIndex >= 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0">
                    <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
                    <span>تغيير الصورة</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || file.size > 1_500_000) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === 'string') {
                            const next = [...menuItems];
                            next[itemIndex] = { ...(item as MenuItem), image: reader.result };
                            setDraftConfig((p) => ({ ...p, items: next }));
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={item.image}
                    onChange={(e) => {
                      const next = [...menuItems];
                      next[itemIndex] = { ...(item as MenuItem), image: e.target.value };
                      setDraftConfig((p) => ({ ...p, items: next }));
                    }}
                    placeholder="رابط الصورة"
                    className="flex-1 min-w-0 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-left text-[11px]"
                  />
                </div>
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => {
                    const next = [...menuItems];
                    next[itemIndex] = { ...(item as MenuItem), name: e.target.value };
                    setDraftConfig((p) => ({ ...p, items: next }));
                  }}
                  className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 font-display font-bold text-sm"
                />
                <textarea
                  rows={2}
                  value={item.description}
                  onChange={(e) => {
                    const next = [...menuItems];
                    next[itemIndex] = { ...(item as MenuItem), description: e.target.value };
                    setDraftConfig((p) => ({ ...p, items: next }));
                  }}
                  className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                />
                <input
                  type="number"
                  step="0.05"
                  value={item.price}
                  onChange={(e) => {
                    const next = [...menuItems];
                    next[itemIndex] = { ...(item as MenuItem), price: Number(e.target.value || 1) };
                    setDraftConfig((p) => ({ ...p, items: next }));
                  }}
                  className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                />
              </div>
            ) : (
              <>
                <h3 className="font-display font-extrabold text-base sm:text-lg text-[var(--text-primary)] mb-1.5">
                  {item.name}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-5 pb-4 pt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] mt-auto">
          <span className="tabular-nums font-display font-black text-lg text-[var(--accent-gold)]">
            {formatPrice(item.price, currency)}
          </span>

          {editable ? (
            <button
              type="button"
              onClick={() =>
                setDraftConfig((p) => ({
                  ...p,
                  items: p.items.filter((i) => i.id !== item.id),
                }))
              }
              className="min-h-[42px] px-3 py-1.5 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] font-bold text-xs inline-flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>حذف</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {hasOptions && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectProduct(item);
                  }}
                  aria-label={`تخصيص ${item.name}`}
                  className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3 py-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--border-hairline)] text-[var(--text-primary)] font-bold text-xs active:scale-[0.97] transition-transform whitespace-nowrap"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>تخصيص</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickAdd(item);
                }}
                aria-label={`إضافة سريعة لـ ${item.name}`}
                className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-bold text-xs sm:text-sm active:scale-[0.97] transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>أضف</span>
              </button>
            </div>
          )}
        </div>
      </motion.article>
    );
  };

  return (
    <section id="menu" className="scroll-mt-20 pt-4 pb-8">
      {/* قسم المفضلة السريع إذا أضاف الزائر أو العميل أطباقاً إلى مفضلته */}
      {favoriteProducts.length > 0 && (
        <div className="mb-10 p-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/35 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 fill-[var(--accent-fire)] text-[var(--accent-fire)]" aria-hidden="true" />
              <h2 className="font-display font-black text-xl sm:text-2xl text-[var(--text-primary)]">
                اختياراتك المفضلة
              </h2>
            </div>
            <span className="text-xs font-bold text-[var(--text-muted)] tabular-nums">
              {favoriteProducts.length} أصناف
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {favoriteProducts.map((prod) => renderCard(prod, false))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)]">
            قائمة الطعام الكاملة
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            اضغط أضف للإضافة الفورية أو تخصيص لاختيار الخبز والمايونيز وشرائح الشاورما والصوصات
          </p>
        </div>

        {isSectionEditable && (
          <button
            type="button"
            onClick={handleAddCategory}
            className="min-h-[42px] px-4 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-black text-xs inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>إضافة قسم منيو</span>
          </button>
        )}
      </div>

      <div className="safari-sticky top-[56px] sm:top-[64px] z-30 -mx-4 px-4 sm:mx-0 sm:px-0 py-2.5 bg-[var(--bg-header)] safari-blur border-b border-[var(--border-hairline)] mb-6">
        <div
          role="tablist"
          aria-label="تصنيفات القائمة"
          className="touch-scroll-x flex items-center gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap shrink-0 transition-colors ${
              activeCategory === 'all'
                ? 'bg-[var(--accent-fire)] text-white shadow-sm'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
            }`}
          >
            الكل ({menuItems.length})
          </button>

          {categories.map((category) => {
            const isActive = activeCategory === category.id;
            const catCount = menuItems.filter((i) => i.categoryId === category.id).length;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(category.id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-[var(--accent-fire)] text-white shadow-sm'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] hover:text-[var(--text-primary)]'
                }`}
              >
                {category.name} ({catCount})
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-10">
        {visibleGroups.map(({ category, items }) => (
          <div key={category.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              {isSectionEditable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={category.name}
                    onChange={(e) =>
                      setDraftConfig((p) => ({
                        ...p,
                        categories: p.categories.map((c) =>
                          c.id === category.id ? { ...c, name: e.target.value } : c
                        ),
                      }))
                    }
                    className="rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/60 px-3 py-1.5 font-display font-black text-lg text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddItemToCategory(category.id)}
                    className="min-h-[38px] px-3 rounded-xl bg-[var(--accent-fire)] text-white text-xs font-extrabold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>صنف جديد</span>
                  </button>
                  {categories.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraftConfig((p) => ({
                          ...p,
                          categories: p.categories.filter((c) => c.id !== category.id),
                          items: p.items.filter((i) => i.categoryId !== category.id),
                        }));
                        if (activeCategory === category.id) setActiveCategory('all');
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>حذف القسم</span>
                    </button>
                  )}
                </div>
              ) : (
                <h3 className="font-display font-black text-xl sm:text-2xl text-[var(--text-primary)]">
                  {category.name}
                </h3>
              )}
              <span className="text-xs font-bold text-[var(--text-muted)] tabular-nums">
                {items.length} أصناف
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {items.map((it) => renderCard(it, true))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
