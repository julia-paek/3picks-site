((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RecommendationCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const CATEGORY_ORDER = Object.freeze([
    "텀블러",
    "에코백",
    "볼펜",
    "우산",
    "티셔츠·단체복",
    "수건·타올",
    "머그컵",
    "보조배터리",
    "노트·다이어리",
    "보온보냉·런치백",
  ]);

  function selectOperatingProducts(products, categoryOrder = CATEGORY_ORDER, maxRank = 10) {
    const categoryIndexes = new Map(categoryOrder.map((category, index) => [category, index]));
    return products.filter((product) => {
      const rank = Number(product.rank);
      return categoryIndexes.has(product.category) && Number.isInteger(rank) && rank >= 1 && rank <= maxRank;
    }).sort((left, right) => {
      const categoryDifference = categoryIndexes.get(left.category) - categoryIndexes.get(right.category);
      return categoryDifference || Number(left.rank) - Number(right.rank);
    });
  }

  // ----- site-overrides 병합 계층 — app.js와 operations/admin.html이 같은 함수를 쓴다 (사본 금지)
  const OVERRIDABLE_PRODUCT_FIELDS = Object.freeze([
    "rank", "visibility", "price", "moq", "leadDays", "tags", "popularity",
    "name", "titleUsesImageLabel", "printMethod", "lead", "moqText", "supplier", "imageLabels", "images", "status",
  ]);
  const PRODUCT_STATUSES = Object.freeze(["active", "hidden", "archived"]);
  const PRODUCT_FIELD_LIMITS = Object.freeze({ printMethod: 30 });
  const PRODUCT_TITLE_SERIAL_PATTERN = /\b(?:A\d{6}|K\d{6}|Z\d{3}|WB\d{3}|PS\d{2}|1008PD|allo\d+MW|UM\d+|M20|25A)\b/i;

  function titleHasSerialCode(value) {
    return PRODUCT_TITLE_SERIAL_PATTERN.test(String(value || ""));
  }

  // status가 없는 원본 상품은 active로 본다
  function productStatus(product) {
    const value = product && product.status;
    return PRODUCT_STATUSES.includes(value) ? value : "active";
  }

  function applyProductOverrides(products, productOverrides) {
    const map = productOverrides || {};
    return products.map((product) => {
      const patch = map[product.id];
      if (!patch) return product;
      const merged = { ...product };
      OVERRIDABLE_PRODUCT_FIELDS.forEach((field) => {
        if (patch[field] !== undefined && patch[field] !== null) merged[field] = patch[field];
      });
      return merged;
    });
  }

  // 원본 × 수정 델타 + 콘솔에서 등록한 신규 상품(원본과 id가 겹치면 원본이 이긴다)
  function mergeSiteProducts(baseProducts, overrides) {
    const merged = applyProductOverrides(Array.isArray(baseProducts) ? baseProducts : [], overrides && overrides.productOverrides);
    const additions = overrides && Array.isArray(overrides.productAdditions) ? overrides.productAdditions : [];
    const usedIds = new Set(merged.map((product) => product.id));
    return merged.concat(additions.filter((item) => item && item.id && !usedIds.has(item.id)).map((item) => ({ ...item })));
  }

  // 숨김·보관 상품을 뺀 뒤 카테고리 안 순위를 1부터 촘촘하게 다시 매긴다 —
  // 3위를 숨기면 11위가 자연히 운영 10위 안으로 올라오게 하는 장치
  function filterActiveProducts(products) {
    const byCategory = new Map();
    products.filter((product) => productStatus(product) === "active").forEach((product) => {
      if (!byCategory.has(product.category)) byCategory.set(product.category, []);
      byCategory.get(product.category).push(product);
    });
    const result = [];
    byCategory.forEach((items) => {
      items.sort((left, right) => (Number(left.rank) - Number(right.rank)) || (Number(left.number) - Number(right.number)))
        .forEach((product, index) => {
          result.push(Number(product.rank) === index + 1 ? product : { ...product, rank: index + 1 });
        });
    });
    return result;
  }

  function activeSiteProducts(baseProducts, overrides) {
    return filterActiveProducts(mergeSiteProducts(baseProducts, overrides));
  }

  const DEFAULT_WEIGHTS = Object.freeze({
    tagMatch: 12,
    popularityHigh: 4,
    popularityMid: 2,
    qualityBase: 12,
    relevanceBase: 18,
    relevanceStep: 3,
    seasonal: 6,
  });

  function normalizeWeights(weights) {
    if (!weights) return DEFAULT_WEIGHTS;
    const merged = { ...DEFAULT_WEIGHTS };
    Object.keys(DEFAULT_WEIGHTS).forEach((key) => {
      const value = Number(weights[key]);
      if (Number.isFinite(value) && value >= 0) merged[key] = value;
    });
    return merged;
  }

  const popularityScore = (value, weights = DEFAULT_WEIGHTS) =>
    value === "상" ? weights.popularityHigh : value === "중" ? weights.popularityMid : 0;

  function seasonalScore(product, month, weights = DEFAULT_WEIGHTS) {
    if (product.category === "우산" && [5, 6, 7].includes(month)) return weights.seasonal;
    if (product.category === "노트·다이어리" && [10, 11, 12].includes(month)) return weights.seasonal;
    if (product.category === "티셔츠·단체복" && [4, 5, 9, 10].includes(month)) return weights.seasonal;
    if (product.category === "보온보냉·런치백" && month >= 4 && month <= 7) return weights.seasonal;
    return 0;
  }

  function productScore(product, answers, categoryOrder, month, weights = DEFAULT_WEIGHTS) {
    const tagScore = (product.tags || []).filter((tag) => (answers.tags || []).includes(tag)).length * weights.tagMatch;
    const qualityScore = Math.max(0, weights.qualityBase - Number(product.rank || weights.qualityBase));
    const categoryIndex = categoryOrder.indexOf(product.category);
    const relevanceScore = categoryIndex < 0 ? 0 : Math.max(0, weights.relevanceBase - categoryIndex * weights.relevanceStep);
    return tagScore + popularityScore(product.popularity, weights) + qualityScore + relevanceScore + seasonalScore(product, month, weights);
  }

  function eligibleProducts({ products, answers, categoryOrder, leadLimit, month, weights }) {
    const count = Number(answers.count);
    const excluded = new Set(answers.excludes || []);
    const effectiveWeights = normalizeWeights(weights);
    return selectOperatingProducts(products).filter((product) => {
      if (excluded.has(product.category) || product.visibility !== "화면노출" || !product.available) return false;
      if (!product.price || !product.moq || !product.leadDays) return false;
      if (product.moq > count || product.leadDays > leadLimit) return false;
      if (answers.publicRecipient === "포함" && product.price > 50000) return false;
      if (answers.logo === "예" && (!product.printMethod || product.printMethod.includes("문의"))) return false;
      return true;
    }).map((product) => ({
      product,
      score: productScore(product, answers, categoryOrder, month, effectiveWeights),
    }));
  }

  function enumerateBundles(scored, targetPrice, publicRecipient, count = 0, totalBudget = 0) {
    const bundles = [];
    const push = (items) => {
      if (new Set(items.map((item) => item.product.category)).size !== items.length) return;
      const totalPrice = items.reduce((sum, item) => sum + Number(item.product.price), 0);
      if (publicRecipient === "포함" && totalPrice > 50000) return;
      const appliedQuantities = items.map((item) => Math.max(Number(count) || 0, Number(item.product.moq) || 0));
      const estimatedTotal = Number(count) > 0
        ? items.reduce((sum, item, index) => sum + Number(item.product.price) * appliedQuantities[index], 0)
        : null;
      const totalDifference = Number(totalBudget) > 0 && estimatedTotal !== null ? Number(totalBudget) - estimatedTotal : null;
      bundles.push({
        products: items.map((item) => item.product),
        totalPrice,
        targetPrice,
        difference: targetPrice - totalPrice,
        quantity: Number(count) || null,
        appliedQuantities,
        estimatedTotal,
        totalBudget: Number(totalBudget) || null,
        totalDifference,
        hasMoqAdjustment: appliedQuantities.some((quantity) => quantity > Number(count)),
        score: items.reduce((sum, item) => sum + item.score, 0),
      });
    };

    for (let first = 0; first < scored.length; first += 1) {
      push([scored[first]]);
      for (let second = first + 1; second < scored.length; second += 1) {
        push([scored[first], scored[second]]);
        for (let third = second + 1; third < scored.length; third += 1) {
          push([scored[first], scored[second], scored[third]]);
        }
      }
    }

    return bundles.sort((a, b) => {
      const leftDifference = a.totalDifference === null ? a.difference : a.totalDifference;
      const rightDifference = b.totalDifference === null ? b.difference : b.totalDifference;
      const distance = Math.abs(leftDifference) - Math.abs(rightDifference);
      if (distance) return distance;
      const overage = Number(leftDifference < 0) - Number(rightDifference < 0);
      if (overage) return overage;
      if (b.score !== a.score) return b.score - a.score;
      return b.products.length - a.products.length;
    });
  }

  function diverseTopThree(bundles) {
    const signatures = new Set();
    return bundles.filter((bundle) => {
      const signature = bundle.products.map((product) => product.id).sort().join(".");
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    }).slice(0, 3);
  }

  function fallbackCandidates({ products, answers, categoryOrder, leadLimit, month, targetPrice, weights }) {
    const effectiveOrder = categoryOrder?.length ? categoryOrder : CATEGORY_ORDER;
    const effectiveWeights = normalizeWeights(weights);
    const excluded = new Set(answers.excludes || []);
    const base = selectOperatingProducts(products).filter((product) => {
      if (!product.available || !Number(product.price)) return false;
      if (answers.publicRecipient === "포함" && Number(product.price) > 50000) return false;
      return true;
    });
    const preferred = base.filter((product) => !excluded.has(product.category));
    const preferredCategories = new Set(preferred.map((product) => product.category));
    const pool = preferredCategories.size >= 3 ? preferred : base;
    const scored = pool.map((product) => ({ product, score: productScore(product, answers, effectiveOrder, month, effectiveWeights) }));
    const byCategory = new Map();
    scored.forEach((item) => {
      if (!byCategory.has(item.product.category)) byCategory.set(item.product.category, []);
      byCategory.get(item.product.category).push(item);
    });
    const selected = new Map();
    const keep = (item) => item && selected.set(item.product.id, item);
    byCategory.forEach((items) => {
      const byScore = [...items].sort((a, b) => b.score - a.score || Number(a.product.rank) - Number(b.product.rank));
      const byPrice = [...items].sort((a, b) => Number(a.product.price) - Number(b.product.price));
      const byTarget = [...items].sort((a, b) => Math.abs(Number(a.product.price) - Number(targetPrice || 0)) - Math.abs(Number(b.product.price) - Number(targetPrice || 0)));
      keep(byScore[0]);
      keep(byPrice[0]);
      keep(byPrice.at(-1));
      keep(byTarget[0]);
    });
    return [...selected.values()].sort((a, b) => b.score - a.score || Number(a.product.rank) - Number(b.product.rank));
  }

  function mergeCandidates(primary, fallback) {
    const merged = new Map(fallback.map((item) => [item.product.id, item]));
    primary.forEach((item) => merged.set(item.product.id, item));
    return [...merged.values()];
  }

  function fallbackReasons(product, answers, leadLimit) {
    const reasons = [];
    if ((answers.excludes || []).includes(product.category)) reasons.push("제외 품목");
    if (product.visibility !== "화면노출") reasons.push("상담 제안 상품");
    if (Number(product.moq) > Number(answers.count)) reasons.push("최소 주문 수량");
    if (Number(product.leadDays) > Number(leadLimit)) reasons.push("희망 납기");
    if (answers.logo === "예" && (!product.printMethod || product.printMethod.includes("문의"))) reasons.push("인쇄 방식");
    return reasons;
  }

  function enrichGroups(groups, exactIds, answers, leadLimit, effectiveBudget) {
    const count = Number(answers.count) || 0;
    return groups.map((group) => {
      const usedFallback = group.products.some((product) => !exactIds.has(product.id));
      const consultationChecks = usedFallback
        ? [...new Set(group.products.flatMap((product) => fallbackReasons(product, answers, leadLimit)))]
        : [];
      return {
        ...group,
        quantity: count,
        totalBudget: effectiveBudget || group.totalBudget,
        usedFallback,
        consultationChecks,
      };
    });
  }

  function unknownBudgetPicks(scored, categoryOrder, count = 0) {
    const ordered = [...scored].sort((a, b) => {
      const leftCategory = categoryOrder.indexOf(a.product.category);
      const rightCategory = categoryOrder.indexOf(b.product.category);
      const categoryDifference = (leftCategory < 0 ? 99 : leftCategory) - (rightCategory < 0 ? 99 : rightCategory);
      return categoryDifference || b.score - a.score || Number(a.product.rank || 99) - Number(b.product.rank || 99);
    });
    const used = new Set();
    return ordered.filter((item) => {
      if (used.has(item.product.category)) return false;
      used.add(item.product.category);
      return true;
    }).slice(0, 3).map((item, index) => ({
      category: `추천 ${String(index + 1).padStart(2, "0")}`,
      products: [item.product],
      isBundle: true,
      budgetUnknown: true,
      totalPrice: Number(item.product.price),
      targetPrice: null,
      difference: null,
      quantity: Number(count) || null,
      appliedQuantities: [Math.max(Number(count) || 0, Number(item.product.moq) || 0)],
      estimatedTotal: Number(item.product.price) * Math.max(Number(count) || 0, Number(item.product.moq) || 0),
      totalBudget: null,
      totalDifference: null,
      hasMoqAdjustment: Number(item.product.moq) > Number(count),
    }));
  }

  function recommend({ products, answers, categoryOrder, leadLimit, month, weights }) {
    const scored = eligibleProducts({ products, answers, categoryOrder, leadLimit, month, weights });
    const count = Number(answers.count);
    if (!count) return [];
    const exactIds = new Set(scored.map((item) => item.product.id));

    if (answers.budgetUnknown) {
      let candidates = scored;
      let groups = unknownBudgetPicks(candidates, categoryOrder, count);
      if (groups.length < 3) {
        candidates = mergeCandidates(scored, fallbackCandidates({ products, answers, categoryOrder, leadLimit, month, targetPrice: 0, weights }));
        groups = unknownBudgetPicks(candidates, categoryOrder?.length ? categoryOrder : CATEGORY_ORDER, count);
      }
      return enrichGroups(groups, exactIds, answers, leadLimit, null);
    }

    const totalBudget = Number(answers.budget);
    if (!totalBudget) return [];
    const perPerson = Math.floor(totalBudget / count);
    const targetPrice = answers.publicRecipient === "포함" ? Math.min(perPerson, 50000) : perPerson;
    const effectiveBudget = answers.publicRecipient === "포함" ? Math.min(totalBudget, count * 50000) : totalBudget;
    let bundles = diverseTopThree(enumerateBundles(scored, targetPrice, answers.publicRecipient, count, effectiveBudget));
    if (bundles.length < 3) {
      const fallback = fallbackCandidates({ products, answers, categoryOrder, leadLimit, month, targetPrice, weights });
      bundles = diverseTopThree(enumerateBundles(mergeCandidates(scored, fallback), targetPrice, answers.publicRecipient, count, effectiveBudget));
    }
    const groups = bundles.map((bundle, index) => ({
      ...bundle,
      category: `구성 ${String(index + 1).padStart(2, "0")}`,
      isBundle: true,
      budgetUnknown: false,
    }));
    return enrichGroups(groups, exactIds, answers, leadLimit, effectiveBudget);
  }

  return {
    CATEGORY_ORDER, DEFAULT_WEIGHTS, selectOperatingProducts, eligibleProducts, fallbackCandidates, enumerateBundles, recommend,
    OVERRIDABLE_PRODUCT_FIELDS, PRODUCT_STATUSES, PRODUCT_FIELD_LIMITS,
    titleHasSerialCode, productStatus, applyProductOverrides, mergeSiteProducts, filterActiveProducts, activeSiteProducts,
  };
});
