/* A curated INCI dictionary. Not exhaustive — unmatched ingredients still
   render, they simply carry no annotation. */

export const TAG_LABEL = {
  solvent: 'Solvent',
  humectant: 'Humectant',
  emollient: 'Emollient',
  occlusive: 'Occlusive',
  emulsifier: 'Emulsifier',
  surfactant: 'Cleansing agent',
  preservative: 'Preservative',
  thickener: 'Texture',
  ph: 'pH adjuster',
  antioxidant: 'Antioxidant',
  soothing: 'Soothing',
  barrier: 'Barrier support',
  aha: 'AHA',
  bha: 'BHA',
  pha: 'PHA',
  enzyme: 'Enzyme exfoliant',
  retinoid: 'Retinoid',
  'vitamin-c': 'Vitamin C',
  niacinamide: 'Niacinamide',
  peptide: 'Peptide',
  ceramide: 'Ceramide',
  'uv-filter': 'UV filter',
  brightening: 'Brightening',
  'anti-acne': 'Anti-blemish',
  oil: 'Plant oil',
  texture: 'Texture',
  fragrance: 'Fragrance',
  'essential-oil': 'Essential oil',
  alcohol: 'Drying alcohol',
  photosensitising: 'Photosensitising',
  comedogenic: 'May clog',
  dye: 'Colourant'
};

/* Tags worth naming at the top of a product page. */
export const ACTIVE_TAGS = [
  'retinoid', 'vitamin-c', 'niacinamide', 'aha', 'bha', 'pha', 'enzyme',
  'peptide', 'ceramide', 'antioxidant', 'brightening', 'anti-acne', 'uv-filter'
];

/* Tags worth a caution. */
export const FLAG_TAGS = ['fragrance', 'essential-oil', 'alcohol', 'photosensitising', 'comedogenic', 'dye'];

const D = (n, f, t) => ({ n, f, t });

export const INGREDIENTS = {
  /* --- base and solvents --- */
  'water': D('Water', 'The base most formulas are built on.', ['solvent']),
  'alcohol denat': D('Denatured alcohol', 'Thins texture and speeds drying. High in the list, it can be dehydrating on already-dry or sensitised skin.', ['solvent', 'alcohol']),
  'alcohol': D('Alcohol', 'Solvent that gives a fast, weightless finish; drying in quantity.', ['solvent', 'alcohol']),
  'sd alcohol 40-b': D('SD Alcohol 40-B', 'Cosmetic-grade denatured alcohol used as a solvent.', ['solvent', 'alcohol']),
  'isopropyl alcohol': D('Isopropyl alcohol', 'Strong solvent, drying on skin.', ['solvent', 'alcohol']),
  'benzyl alcohol': D('Benzyl alcohol', 'Preservative and solvent — not one of the drying alcohols.', ['preservative']),
  'butylene glycol': D('Butylene glycol', 'Lightweight humectant that also helps dissolve other actives.', ['humectant', 'solvent']),
  'propanediol': D('Propanediol', 'Plant-derived humectant and solvent with a light finish.', ['humectant', 'solvent']),
  'propylene glycol': D('Propylene glycol', 'Humectant and solvent; occasionally sensitising.', ['humectant', 'solvent']),
  'dipropylene glycol': D('Dipropylene glycol', 'Humectant solvent used to thin heavier bases.', ['humectant', 'solvent']),
  'pentylene glycol': D('Pentylene glycol', 'Humectant with mild preservative action.', ['humectant', 'preservative']),
  'hexylene glycol': D('Hexylene glycol', 'Solvent and viscosity reducer.', ['solvent']),
  'caprylyl glycol': D('Caprylyl glycol', 'Conditioning humectant that supports the preservative system.', ['humectant', 'preservative']),
  '1,2-hexanediol': D('1,2-Hexanediol', 'Humectant and preservative booster.', ['humectant', 'preservative']),
  'glycerin': D('Glycerin', 'The workhorse humectant — draws water into the upper layers of skin.', ['humectant']),
  'isododecane': D('Isododecane', 'Volatile emollient that spreads thinly and evaporates.', ['emollient', 'texture']),

  /* --- humectants --- */
  'sodium hyaluronate': D('Sodium hyaluronate', 'The salt form of hyaluronic acid; holds water at the surface.', ['humectant']),
  'hyaluronic acid': D('Hyaluronic acid', 'Large humectant molecule that binds many times its weight in water.', ['humectant']),
  'hydrolyzed hyaluronic acid': D('Hydrolysed hyaluronic acid', 'Smaller fragments intended to sit slightly deeper than standard HA.', ['humectant']),
  'sodium pca': D('Sodium PCA', 'Part of skin’s own natural moisturising factor.', ['humectant', 'barrier']),
  'betaine': D('Betaine', 'Gentle humectant with a soothing, anti-irritant character.', ['humectant', 'soothing']),
  'trehalose': D('Trehalose', 'Sugar humectant that helps skin hold water under stress.', ['humectant']),
  'urea': D('Urea', 'Hydrates at low levels; softens and loosens rough skin at high levels.', ['humectant', 'barrier']),
  'panthenol': D('Panthenol', 'Pro-vitamin B5 — hydrating, calming, and supportive of barrier repair.', ['humectant', 'soothing', 'barrier']),
  'sorbitol': D('Sorbitol', 'Sugar alcohol humectant.', ['humectant']),
  'saccharide isomerate': D('Saccharide isomerate', 'Plant sugar complex that binds to skin for long-lasting hydration.', ['humectant']),
  'polyglutamic acid': D('Polyglutamic acid', 'Fermentation-derived humectant, film-forming and very water-binding.', ['humectant']),
  'beta-glucan': D('Beta-glucan', 'Oat- or yeast-derived; hydrating and notably calming.', ['humectant', 'soothing']),
  'honey': D('Honey', 'Humectant with mild antibacterial character.', ['humectant']),

  /* --- emollients, oils, occlusives --- */
  'squalane': D('Squalane', 'Weightless, stable emollient that mimics skin’s own lipids.', ['emollient']),
  'caprylic/capric triglyceride': D('Caprylic/capric triglyceride', 'Coconut-derived emollient with a dry, silky slip.', ['emollient']),
  'cetearyl alcohol': D('Cetearyl alcohol', 'Fatty alcohol — softens and thickens. Not drying.', ['emollient', 'thickener']),
  'cetyl alcohol': D('Cetyl alcohol', 'Fatty alcohol used to give body to creams.', ['emollient', 'thickener']),
  'stearyl alcohol': D('Stearyl alcohol', 'Fatty alcohol; emollient and thickener.', ['emollient', 'thickener']),
  'behenyl alcohol': D('Behenyl alcohol', 'Rich fatty alcohol for cushioned textures.', ['emollient', 'thickener']),
  'simmondsia chinensis seed oil': D('Jojoba oil', 'A liquid wax close in structure to skin’s own sebum.', ['emollient', 'oil']),
  'butyrospermum parkii butter': D('Shea butter', 'Rich butter — softening and semi-occlusive.', ['emollient', 'occlusive']),
  'helianthus annuus seed oil': D('Sunflower seed oil', 'High in linoleic acid; supports the barrier.', ['emollient', 'oil', 'barrier']),
  'rosa canina fruit oil': D('Rosehip oil', 'Carries natural vitamin A and antioxidants.', ['emollient', 'oil', 'antioxidant']),
  'argania spinosa kernel oil': D('Argan oil', 'Light, vitamin E-rich plant oil.', ['emollient', 'oil']),
  'persea gratissima oil': D('Avocado oil', 'Heavier oil for dry, depleted skin.', ['emollient', 'oil']),
  'cocos nucifera oil': D('Coconut oil', 'Very occlusive; known to clog on acne-prone skin.', ['emollient', 'oil', 'comedogenic']),
  'olea europaea fruit oil': D('Olive oil', 'Rich oil, occlusive and softening.', ['emollient', 'oil']),
  'prunus amygdalus dulcis oil': D('Sweet almond oil', 'Mild, softening plant oil.', ['emollient', 'oil']),
  'vitis vinifera seed oil': D('Grapeseed oil', 'Light, linoleic-rich oil that absorbs quickly.', ['emollient', 'oil']),
  'oenothera biennis oil': D('Evening primrose oil', 'Rich in gamma-linolenic acid; calming for dry skin.', ['emollient', 'oil', 'barrier']),
  'macadamia integrifolia seed oil': D('Macadamia oil', 'Cushioning oil high in palmitoleic acid.', ['emollient', 'oil']),
  'isopropyl myristate': D('Isopropyl myristate', 'Fast-absorbing emollient with a reputation for clogging.', ['emollient', 'comedogenic']),
  'isopropyl palmitate': D('Isopropyl palmitate', 'Emollient and thickener; may clog on acne-prone skin.', ['emollient', 'comedogenic']),
  'ethylhexyl palmitate': D('Ethylhexyl palmitate', 'Light emollient ester with a dry finish.', ['emollient']),
  'coco-caprylate': D('Coco-caprylate', 'Plant-derived light emollient, a silicone alternative.', ['emollient']),
  'mineral oil': D('Mineral oil', 'Inert occlusive that reduces water loss.', ['occlusive', 'emollient']),
  'paraffinum liquidum': D('Mineral oil', 'Inert occlusive that reduces water loss.', ['occlusive', 'emollient']),
  'petrolatum': D('Petrolatum', 'The most effective occlusive available; seals water in.', ['occlusive']),
  'lanolin': D('Lanolin', 'Wool-derived occlusive, excellent on very dry or chapped skin.', ['occlusive', 'emollient']),
  'dimethicone': D('Dimethicone', 'Silicone that smooths the surface and slows water loss.', ['occlusive', 'emollient', 'texture']),
  'cyclopentasiloxane': D('Cyclopentasiloxane', 'Volatile silicone giving instant slip, then evaporating.', ['emollient', 'texture']),
  'phenyl trimethicone': D('Phenyl trimethicone', 'Silicone that adds gloss and spreadability.', ['emollient', 'texture']),
  'dimethicone crosspolymer': D('Dimethicone crosspolymer', 'Silicone gel that blurs texture and absorbs oil.', ['texture']),

  /* --- barrier lipids --- */
  'ceramide np': D('Ceramide NP', 'A key barrier lipid; helps rebuild the skin’s mortar.', ['ceramide', 'barrier']),
  'ceramide ap': D('Ceramide AP', 'Barrier lipid, usually paired with NP and EOP.', ['ceramide', 'barrier']),
  'ceramide eop': D('Ceramide EOP', 'Barrier lipid that supports water retention.', ['ceramide', 'barrier']),
  'ceramide ns': D('Ceramide NS', 'Barrier lipid found naturally in the stratum corneum.', ['ceramide', 'barrier']),
  'cholesterol': D('Cholesterol', 'Works alongside ceramides and fatty acids to restore the barrier.', ['barrier', 'emollient']),
  'phytosphingosine': D('Phytosphingosine', 'Ceramide precursor; calming and mildly antibacterial.', ['barrier', 'soothing']),
  'lecithin': D('Lecithin', 'Phospholipid emulsifier that also conditions.', ['emollient', 'emulsifier']),
  'linoleic acid': D('Linoleic acid', 'Essential fatty acid often low in acne-prone skin.', ['barrier', 'emollient']),
  'stearic acid': D('Stearic acid', 'Fatty acid used to thicken and soften.', ['emollient', 'thickener']),
  'palmitic acid': D('Palmitic acid', 'Fatty acid, emollient and structuring.', ['emollient', 'thickener']),
  'myristic acid': D('Myristic acid', 'Fatty acid; forms soap-based cleansers with alkali.', ['surfactant', 'emollient']),

  /* --- the actives --- */
  'niacinamide': D('Niacinamide', 'Vitamin B3. Regulates oil, evens tone, strengthens the barrier — the most broadly useful active there is.', ['niacinamide', 'brightening', 'barrier']),
  'ascorbic acid': D('L-Ascorbic acid', 'Pure vitamin C. Strong antioxidant and brightener; unstable, and best used in the morning.', ['vitamin-c', 'antioxidant', 'brightening']),
  '3-o-ethyl ascorbic acid': D('3-O-Ethyl ascorbic acid', 'Stable vitamin C derivative, less irritating than the pure acid.', ['vitamin-c', 'brightening']),
  'sodium ascorbyl phosphate': D('Sodium ascorbyl phosphate', 'Gentle, stable vitamin C derivative; also anti-blemish.', ['vitamin-c', 'brightening', 'anti-acne']),
  'magnesium ascorbyl phosphate': D('Magnesium ascorbyl phosphate', 'Mild, stable vitamin C derivative.', ['vitamin-c', 'brightening']),
  'ascorbyl glucoside': D('Ascorbyl glucoside', 'Slow-release vitamin C derivative.', ['vitamin-c', 'brightening']),
  'tetrahexyldecyl ascorbate': D('Tetrahexyldecyl ascorbate', 'Oil-soluble vitamin C that penetrates well and stays stable.', ['vitamin-c', 'antioxidant', 'brightening']),
  'retinol': D('Retinol', 'The reference over-the-counter retinoid. Increases cell turnover; introduce slowly and pair with sunscreen.', ['retinoid', 'photosensitising']),
  'retinal': D('Retinaldehyde', 'One step closer to retinoic acid than retinol, so it works faster.', ['retinoid', 'photosensitising']),
  'retinaldehyde': D('Retinaldehyde', 'One step closer to retinoic acid than retinol, so it works faster.', ['retinoid', 'photosensitising']),
  'retinyl palmitate': D('Retinyl palmitate', 'The mildest retinoid ester; gentle but slow.', ['retinoid']),
  'hydroxypinacolone retinoate': D('Hydroxypinacolone retinoate', 'Retinoid ester that acts on receptors directly with less irritation.', ['retinoid']),
  'adapalene': D('Adapalene', 'A prescription-strength retinoid sold over the counter for acne.', ['retinoid', 'anti-acne', 'photosensitising']),
  'tretinoin': D('Tretinoin', 'Prescription retinoic acid — the strongest of the family.', ['retinoid', 'photosensitising']),
  'bakuchiol': D('Bakuchiol', 'Plant extract used as a gentler alternative to retinol.', ['antioxidant', 'soothing']),
  'glycolic acid': D('Glycolic acid', 'The smallest AHA — strong resurfacing, and the most likely to sting.', ['aha', 'photosensitising']),
  'lactic acid': D('Lactic acid', 'Larger AHA; exfoliates while also hydrating.', ['aha', 'humectant', 'photosensitising']),
  'mandelic acid': D('Mandelic acid', 'Large, slow AHA — the kindest option for sensitive or deeper skin tones.', ['aha', 'photosensitising']),
  'malic acid': D('Malic acid', 'Mild AHA, usually a supporting player.', ['aha']),
  'tartaric acid': D('Tartaric acid', 'AHA used mostly to adjust pH in acid blends.', ['aha', 'ph']),
  'salicylic acid': D('Salicylic acid', 'Oil-soluble BHA that clears inside the pore. The active of choice for congestion.', ['bha', 'anti-acne', 'photosensitising']),
  'betaine salicylate': D('Betaine salicylate', 'Gentler relative of salicylic acid.', ['bha', 'anti-acne']),
  'salix alba bark extract': D('Willow bark extract', 'Natural source of salicylates; mildly exfoliating and calming.', ['bha', 'soothing']),
  'gluconolactone': D('Gluconolactone', 'PHA — exfoliates at the surface only, with humectant benefits.', ['pha', 'humectant']),
  'lactobionic acid': D('Lactobionic acid', 'Large PHA, well tolerated by sensitive skin.', ['pha', 'humectant']),
  'papain': D('Papain', 'Papaya enzyme that digests surface proteins for gentle exfoliation.', ['enzyme']),
  'bromelain': D('Bromelain', 'Pineapple enzyme used for mild exfoliation.', ['enzyme']),
  'azelaic acid': D('Azelaic acid', 'Rare triple threat — calms redness, clears blemishes, fades marks.', ['brightening', 'anti-acne', 'soothing']),
  'benzoyl peroxide': D('Benzoyl peroxide', 'Kills acne bacteria directly. Drying, and it bleaches fabric.', ['anti-acne']),
  'sulfur': D('Sulfur', 'Traditional anti-blemish and oil-absorbing active.', ['anti-acne']),
  'zinc pca': D('Zinc PCA', 'Helps regulate sebum; mildly calming.', ['anti-acne', 'soothing']),
  'tranexamic acid': D('Tranexamic acid', 'Targets stubborn pigmentation, including melasma.', ['brightening']),
  'alpha-arbutin': D('Alpha-arbutin', 'Blocks pigment formation gently; well tolerated.', ['brightening']),
  'arbutin': D('Arbutin', 'Plant-derived brightener that interrupts pigment production.', ['brightening']),
  'kojic acid': D('Kojic acid', 'Fungal-derived brightener for dark marks.', ['brightening']),
  'hydroquinone': D('Hydroquinone', 'The strongest pigment inhibitor; regulated in many markets.', ['brightening']),
  'glycyrrhiza glabra root extract': D('Licorice root extract', 'Calming, and a mild brightener for post-blemish marks.', ['brightening', 'soothing']),
  'adenosine': D('Adenosine', 'Signalling molecule used for firmness and line-smoothing.', ['antioxidant']),
  'palmitoyl tripeptide-1': D('Palmitoyl tripeptide-1', 'Signal peptide associated with collagen support.', ['peptide']),
  'palmitoyl tetrapeptide-7': D('Palmitoyl tetrapeptide-7', 'Peptide used to temper inflammatory signalling.', ['peptide']),
  'palmitoyl pentapeptide-4': D('Palmitoyl pentapeptide-4', 'Well-studied signal peptide for firmness.', ['peptide']),
  'acetyl hexapeptide-8': D('Acetyl hexapeptide-8', 'Peptide aimed at expression lines.', ['peptide']),
  'copper tripeptide-1': D('Copper tripeptide-1', 'Peptide linked to wound healing and firmness.', ['peptide']),
  'ubiquinone': D('Coenzyme Q10', 'Antioxidant naturally present in skin.', ['antioxidant']),
  'ferulic acid': D('Ferulic acid', 'Antioxidant that stabilises vitamins C and E.', ['antioxidant']),
  'tocopherol': D('Vitamin E', 'Fat-soluble antioxidant; protects oils in the formula and lipids in skin.', ['antioxidant', 'emollient']),
  'tocopheryl acetate': D('Tocopheryl acetate', 'Stable vitamin E ester.', ['antioxidant', 'emollient']),
  'resveratrol': D('Resveratrol', 'Polyphenol antioxidant from grapes.', ['antioxidant']),
  'camellia sinensis leaf extract': D('Green tea extract', 'Polyphenol antioxidant, calming on reactive skin.', ['antioxidant', 'soothing']),
  'caffeine': D('Caffeine', 'Antioxidant that temporarily constricts vessels — hence its use around the eye.', ['antioxidant']),
  'ectoin': D('Ectoin', 'Protective molecule that shields cells from environmental stress.', ['soothing', 'humectant']),
  'allantoin': D('Allantoin', 'Quietly soothing and skin-softening.', ['soothing', 'barrier']),
  'bisabolol': D('Bisabolol', 'Chamomile-derived calming agent.', ['soothing']),
  'centella asiatica extract': D('Centella asiatica', 'Cica. Calms redness and supports repair.', ['soothing', 'barrier']),
  'madecassoside': D('Madecassoside', 'The most studied centella fraction; anti-inflammatory.', ['soothing', 'barrier']),
  'asiaticoside': D('Asiaticoside', 'Centella fraction associated with healing.', ['soothing', 'barrier']),
  'aloe barbadensis leaf juice': D('Aloe vera', 'Hydrating and cooling on irritated skin.', ['soothing', 'humectant']),
  'avena sativa kernel extract': D('Oat extract', 'Classic anti-itch, barrier-friendly soother.', ['soothing', 'barrier']),
  'colloidal oatmeal': D('Colloidal oatmeal', 'Clinically recognised for calming eczema-prone skin.', ['soothing', 'barrier']),
  'chamomilla recutita flower extract': D('Chamomile extract', 'Traditional calming botanical.', ['soothing']),
  'calendula officinalis flower extract': D('Calendula extract', 'Gentle, healing botanical.', ['soothing']),
  'dipotassium glycyrrhizate': D('Dipotassium glycyrrhizate', 'Licorice-derived anti-inflammatory.', ['soothing']),
  'snail secretion filtrate': D('Snail secretion filtrate', 'Hydrating repair ingredient popular in Korean formulas.', ['humectant', 'soothing']),
  'galactomyces ferment filtrate': D('Galactomyces ferment filtrate', 'Yeast ferment associated with clarity and texture.', ['brightening', 'humectant']),
  'saccharomyces ferment filtrate': D('Saccharomyces ferment filtrate', 'Yeast ferment used for radiance and hydration.', ['humectant', 'brightening']),
  'bifida ferment lysate': D('Bifida ferment lysate', 'Probiotic ferment; calming and barrier-supportive.', ['soothing', 'barrier']),
  'lactobacillus ferment': D('Lactobacillus ferment', 'Probiotic ferment for barrier and microbiome support.', ['soothing', 'barrier']),
  'hamamelis virginiana water': D('Witch hazel', 'Astringent botanical; check whether it is distilled with alcohol.', ['soothing']),
  'kaolin': D('Kaolin', 'Soft white clay that absorbs oil without stripping.', ['texture', 'anti-acne']),
  'bentonite': D('Bentonite', 'Strongly absorbent clay for masks.', ['texture', 'anti-acne']),
  'charcoal powder': D('Charcoal', 'Absorbs surface oil; largely a textural and visual ingredient.', ['texture']),

  /* --- UV filters --- */
  'zinc oxide': D('Zinc oxide', 'Mineral filter with broad UVA/UVB coverage; also mildly calming.', ['uv-filter', 'soothing']),
  'titanium dioxide': D('Titanium dioxide', 'Mineral filter, strongest in UVB.', ['uv-filter']),
  'butyl methoxydibenzoylmethane': D('Avobenzone', 'The main UVA filter in Western sunscreens; needs stabilising.', ['uv-filter']),
  'ethylhexyl methoxycinnamate': D('Octinoxate', 'Widely used UVB filter.', ['uv-filter']),
  'octocrylene': D('Octocrylene', 'UVB filter that also stabilises avobenzone.', ['uv-filter']),
  'homosalate': D('Homosalate', 'UVB filter and solvent for other filters.', ['uv-filter']),
  'ethylhexyl salicylate': D('Octisalate', 'UVB filter with a light feel.', ['uv-filter']),
  'benzophenone-3': D('Oxybenzone', 'Broad filter, increasingly restricted.', ['uv-filter']),
  'bis-ethylhexyloxyphenol methoxyphenyl triazine': D('Tinosorb S', 'Photostable broad-spectrum filter, outside the US.', ['uv-filter']),
  'methylene bis-benzotriazolyl tetramethylbutylphenol': D('Tinosorb M', 'Broad-spectrum filter that both absorbs and scatters.', ['uv-filter']),
  'diethylamino hydroxybenzoyl hexyl benzoate': D('Uvinul A Plus', 'Strong, photostable UVA filter.', ['uv-filter']),
  'ethylhexyl triazone': D('Uvinul T 150', 'Highly efficient UVB filter.', ['uv-filter']),
  'terephthalylidene dicamphor sulfonic acid': D('Mexoryl SX', 'Water-soluble UVA filter.', ['uv-filter']),
  'drometrizole trisiloxane': D('Mexoryl XL', 'Oil-soluble broad-spectrum filter.', ['uv-filter']),
  'polysilicone-15': D('Polysilicone-15', 'Silicone-based UVB filter with a light finish.', ['uv-filter']),

  /* --- cleansing agents --- */
  'sodium lauryl sulfate': D('Sodium lauryl sulfate', 'Powerful cleanser; harsh on the facial barrier.', ['surfactant']),
  'sodium laureth sulfate': D('Sodium laureth sulfate', 'Milder sulfate, still a strong foaming cleanser.', ['surfactant']),
  'cocamidopropyl betaine': D('Cocamidopropyl betaine', 'Mild co-surfactant that softens harsher ones.', ['surfactant']),
  'coco-glucoside': D('Coco-glucoside', 'Sugar-derived gentle cleanser.', ['surfactant']),
  'decyl glucoside': D('Decyl glucoside', 'Very mild non-ionic cleanser.', ['surfactant']),
  'lauryl glucoside': D('Lauryl glucoside', 'Gentle sugar surfactant.', ['surfactant']),
  'sodium cocoyl isethionate': D('Sodium cocoyl isethionate', 'Creamy, mild cleanser used in syndet bars.', ['surfactant']),
  'sodium methyl cocoyl taurate': D('Sodium methyl cocoyl taurate', 'Gentle foaming agent.', ['surfactant']),
  'polysorbate 20': D('Polysorbate 20', 'Solubiliser that carries oils into water.', ['emulsifier', 'surfactant']),
  'polysorbate 60': D('Polysorbate 60', 'Emulsifier for creams and lotions.', ['emulsifier']),
  'polysorbate 80': D('Polysorbate 80', 'Emulsifier and solubiliser.', ['emulsifier']),
  'peg-40 hydrogenated castor oil': D('PEG-40 hydrogenated castor oil', 'Solubiliser common in cleansing oils and toners.', ['emulsifier', 'surfactant']),

  /* --- structure --- */
  'glyceryl stearate': D('Glyceryl stearate', 'Emulsifier that also leaves skin soft.', ['emulsifier', 'emollient']),
  'peg-100 stearate': D('PEG-100 stearate', 'Co-emulsifier, almost always paired with glyceryl stearate.', ['emulsifier']),
  'cetearyl glucoside': D('Cetearyl glucoside', 'Plant-derived emulsifier.', ['emulsifier']),
  'carbomer': D('Carbomer', 'Gelling polymer that builds thickness.', ['thickener']),
  'acrylates/c10-30 alkyl acrylate crosspolymer': D('Acrylates crosspolymer', 'Thickener and stabiliser for gels and emulsions.', ['thickener']),
  'xanthan gum': D('Xanthan gum', 'Natural gum used to thicken and suspend.', ['thickener']),
  'sclerotium gum': D('Sclerotium gum', 'Natural gum with a light, non-tacky feel.', ['thickener']),
  'hydroxyethylcellulose': D('Hydroxyethylcellulose', 'Cellulose thickener for clear gels.', ['thickener']),
  'sodium polyacrylate': D('Sodium polyacrylate', 'Highly efficient synthetic thickener.', ['thickener']),
  'ammonium acryloyldimethyltaurate/vp copolymer': D('Ammonium acryloyldimethyltaurate/VP copolymer', 'Thickener that gives a bouncy gel texture.', ['thickener']),
  'hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer': D('Hydroxyethyl acrylate copolymer', 'Gel-cream thickener and emulsifier.', ['thickener', 'emulsifier']),
  'sodium chloride': D('Salt', 'Adjusts viscosity in cleansers.', ['thickener']),
  'mica': D('Mica', 'Mineral that adds soft light diffusion.', ['texture']),

  /* --- preservation and pH --- */
  'phenoxyethanol': D('Phenoxyethanol', 'The most common broad-spectrum preservative.', ['preservative']),
  'ethylhexylglycerin': D('Ethylhexylglycerin', 'Preservative booster and skin conditioner.', ['preservative']),
  'chlorphenesin': D('Chlorphenesin', 'Preservative, usually alongside phenoxyethanol.', ['preservative']),
  'sodium benzoate': D('Sodium benzoate', 'Preservative effective in acidic formulas.', ['preservative']),
  'potassium sorbate': D('Potassium sorbate', 'Mild preservative against mould and yeast.', ['preservative']),
  'methylparaben': D('Methylparaben', 'Well-studied, low-irritation preservative.', ['preservative']),
  'propylparaben': D('Propylparaben', 'Paraben preservative.', ['preservative']),
  'ethylparaben': D('Ethylparaben', 'Paraben preservative.', ['preservative']),
  'butylparaben': D('Butylparaben', 'Paraben preservative.', ['preservative']),
  'methylisothiazolinone': D('Methylisothiazolinone', 'Preservative with a notable contact-allergy record.', ['preservative']),
  'dmdm hydantoin': D('DMDM hydantoin', 'Formaldehyde-releasing preservative.', ['preservative']),
  'disodium edta': D('Disodium EDTA', 'Chelator — keeps trace metals from spoiling the formula.', ['preservative']),
  'tetrasodium edta': D('Tetrasodium EDTA', 'Chelator that stabilises the formula.', ['preservative']),
  'sodium phytate': D('Sodium phytate', 'Plant-derived chelator.', ['preservative']),
  'sodium metabisulfite': D('Sodium metabisulfite', 'Antioxidant that protects vitamin C formulas.', ['antioxidant', 'preservative']),
  'sodium hydroxide': D('Sodium hydroxide', 'Raises pH to a skin-appropriate level.', ['ph']),
  'citric acid': D('Citric acid', 'Usually here to adjust pH rather than to exfoliate.', ['ph', 'aha']),
  'sodium citrate': D('Sodium citrate', 'Buffers pH.', ['ph']),
  'triethanolamine': D('Triethanolamine', 'pH adjuster and emulsifier.', ['ph']),
  'tromethamine': D('Tromethamine', 'pH buffer.', ['ph']),
  'aminomethyl propanol': D('Aminomethyl propanol', 'pH adjuster used with acrylate thickeners.', ['ph']),

  /* --- fragrance and colour --- */
  'fragrance': D('Fragrance', 'An undisclosed blend. The most common source of contact reactions.', ['fragrance']),
  'limonene': D('Limonene', 'Citrus fragrance component; oxidises into a sensitiser.', ['fragrance']),
  'linalool': D('Linalool', 'Floral fragrance component and known allergen.', ['fragrance']),
  'citronellol': D('Citronellol', 'Rose-like fragrance allergen.', ['fragrance']),
  'geraniol': D('Geraniol', 'Fragrance allergen requiring EU declaration.', ['fragrance']),
  'eugenol': D('Eugenol', 'Clove-like fragrance allergen.', ['fragrance']),
  'coumarin': D('Coumarin', 'Sweet, hay-like fragrance allergen.', ['fragrance']),
  'citral': D('Citral', 'Lemon fragrance allergen.', ['fragrance']),
  'benzyl salicylate': D('Benzyl salicylate', 'Fragrance component and declared allergen.', ['fragrance']),
  'hexyl cinnamal': D('Hexyl cinnamal', 'Jasmine-like fragrance allergen.', ['fragrance']),
  'alpha-isomethyl ionone': D('Alpha-isomethyl ionone', 'Violet fragrance allergen.', ['fragrance']),
  'lavandula angustifolia oil': D('Lavender oil', 'Fragrant essential oil; can irritate over time.', ['essential-oil', 'fragrance']),
  'citrus aurantium dulcis peel oil': D('Sweet orange peel oil', 'Citrus essential oil — fragrant and potentially photosensitising.', ['essential-oil', 'fragrance', 'photosensitising']),
  'citrus limon peel oil': D('Lemon peel oil', 'Citrus essential oil; phototoxic unless distilled.', ['essential-oil', 'fragrance', 'photosensitising']),
  'citrus bergamia peel oil': D('Bergamot oil', 'Classically phototoxic citrus oil.', ['essential-oil', 'fragrance', 'photosensitising']),
  'melaleuca alternifolia leaf oil': D('Tea tree oil', 'Antibacterial essential oil; effective on spots, sensitising in quantity.', ['essential-oil', 'anti-acne']),
  'mentha piperita oil': D('Peppermint oil', 'Cooling essential oil that frequently irritates.', ['essential-oil', 'fragrance']),
  'rosmarinus officinalis leaf oil': D('Rosemary oil', 'Aromatic essential oil.', ['essential-oil', 'fragrance']),
  'eucalyptus globulus leaf oil': D('Eucalyptus oil', 'Strongly aromatic essential oil.', ['essential-oil', 'fragrance']),
  'pelargonium graveolens flower oil': D('Geranium oil', 'Rose-like essential oil.', ['essential-oil', 'fragrance']),
  'cananga odorata flower oil': D('Ylang ylang oil', 'Heady floral essential oil.', ['essential-oil', 'fragrance']),
  'santalum album oil': D('Sandalwood oil', 'Woody essential oil.', ['essential-oil', 'fragrance']),
  'rosa damascena flower water': D('Rose water', 'Lightly fragrant floral water.', ['soothing', 'fragrance']),
  'ci 77891': D('CI 77891', 'Titanium dioxide used as a white colourant.', ['dye']),
  'ci 77491': D('CI 77491', 'Red iron oxide colourant.', ['dye']),
  'ci 19140': D('CI 19140', 'Yellow synthetic colourant.', ['dye']),
  'ci 42090': D('CI 42090', 'Blue synthetic colourant.', ['dye'])
};

/* Common names, trade names and spellings that map onto a canonical entry. */
const ALIASES = {
  'aqua': 'water', 'eau': 'water', 'purified water': 'water', 'distilled water': 'water',
  'aqua/water/eau': 'water', 'water/aqua/eau': 'water', 'aqua (water)': 'water',
  'parfum': 'fragrance', 'perfume': 'fragrance', 'aroma': 'fragrance', 'fragrance/parfum': 'fragrance',
  'vitamin e': 'tocopherol', 'vitamin c': 'ascorbic acid', 'l-ascorbic acid': 'ascorbic acid',
  'ethyl ascorbic acid': '3-o-ethyl ascorbic acid',
  'vitamin b3': 'niacinamide', 'nicotinamide': 'niacinamide',
  'vitamin b5': 'panthenol', 'd-panthenol': 'panthenol', 'dexpanthenol': 'panthenol',
  'shea butter': 'butyrospermum parkii butter', 'butyrospermum parkii': 'butyrospermum parkii butter',
  'jojoba oil': 'simmondsia chinensis seed oil', 'simmondsia chinensis oil': 'simmondsia chinensis seed oil',
  'rosehip oil': 'rosa canina fruit oil', 'rosa canina seed oil': 'rosa canina fruit oil',
  'argan oil': 'argania spinosa kernel oil', 'coconut oil': 'cocos nucifera oil',
  'sunflower oil': 'helianthus annuus seed oil', 'helianthus annuus oil': 'helianthus annuus seed oil',
  'grapeseed oil': 'vitis vinifera seed oil', 'sweet almond oil': 'prunus amygdalus dulcis oil',
  'avocado oil': 'persea gratissima oil', 'olive oil': 'olea europaea fruit oil',
  'tea tree oil': 'melaleuca alternifolia leaf oil', 'lavender oil': 'lavandula angustifolia oil',
  'centella asiatica': 'centella asiatica extract', 'cica': 'centella asiatica extract',
  'centella asiatica leaf extract': 'centella asiatica extract',
  'green tea extract': 'camellia sinensis leaf extract',
  'camellia sinensis leaf water': 'camellia sinensis leaf extract',
  'licorice root extract': 'glycyrrhiza glabra root extract',
  'liquorice root extract': 'glycyrrhiza glabra root extract',
  'aloe vera': 'aloe barbadensis leaf juice', 'aloe barbadensis leaf extract': 'aloe barbadensis leaf juice',
  'aloe barbadensis leaf juice powder': 'aloe barbadensis leaf juice',
  'oat extract': 'avena sativa kernel extract', 'oat kernel extract': 'avena sativa kernel extract',
  'witch hazel': 'hamamelis virginiana water', 'hamamelis virginiana extract': 'hamamelis virginiana water',
  'hamamelis virginiana leaf extract': 'hamamelis virginiana water',
  'willow bark extract': 'salix alba bark extract',
  'coenzyme q10': 'ubiquinone', 'coq10': 'ubiquinone',
  'hyaluronic acid (sodium hyaluronate)': 'sodium hyaluronate',
  'sodium hyaluronate crosspolymer': 'sodium hyaluronate',
  'hydrolyzed sodium hyaluronate': 'hydrolyzed hyaluronic acid',
  'avobenzone': 'butyl methoxydibenzoylmethane', 'octinoxate': 'ethylhexyl methoxycinnamate',
  'octisalate': 'ethylhexyl salicylate', 'oxybenzone': 'benzophenone-3',
  'tinosorb s': 'bis-ethylhexyloxyphenol methoxyphenyl triazine',
  'tinosorb m': 'methylene bis-benzotriazolyl tetramethylbutylphenol',
  'uvinul a plus': 'diethylamino hydroxybenzoyl hexyl benzoate',
  'uvinul t 150': 'ethylhexyl triazone',
  'mexoryl sx': 'terephthalylidene dicamphor sulfonic acid',
  'mexoryl xl': 'drometrizole trisiloxane',
  'granactive retinoid': 'hydroxypinacolone retinoate',
  'retinyl retinoate': 'hydroxypinacolone retinoate',
  'alpha arbutin': 'alpha-arbutin',
  'caprylic capric triglyceride': 'caprylic/capric triglyceride',
  'coco-caprylate/caprate': 'coco-caprylate',
  'hexanediol': '1,2-hexanediol',
  'mineral oil (paraffinum liquidum)': 'mineral oil',
  'petroleum jelly': 'petrolatum', 'petrolatum (white)': 'petrolatum',
  'ceramide 3': 'ceramide np', 'ceramide 6-ii': 'ceramide ap', 'ceramide 1': 'ceramide eop',
  'ceramide 2': 'ceramide ns', 'ceramide npg': 'ceramide np',
  'charcoal': 'charcoal powder', 'activated charcoal': 'charcoal powder',
  'salicylic acid (bha)': 'salicylic acid', 'glycolic acid (aha)': 'glycolic acid',
  'benzoylperoxide': 'benzoyl peroxide',
  'zinc oxide (nano)': 'zinc oxide', 'titanium dioxide (nano)': 'titanium dioxide',
  'alcohol denatured': 'alcohol denat', 'denatured alcohol': 'alcohol denat',
  'ethanol': 'alcohol', 'ethyl alcohol': 'alcohol'
};

/* Lowercase, strip the decoration ingredient lists collect. */
export function normalize(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\*+/g, ' ')
    .replace(/[.,;:•]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const stripParens = s => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/* Resolve one ingredient name to a dictionary entry, or null. */
export function lookup(raw) {
  const forms = [];
  const base = normalize(raw);
  forms.push(base);
  const bare = stripParens(base);
  if (bare !== base) forms.push(bare);
  // "Butyrospermum Parkii (Shea) Butter" -> "butyrospermum parkii butter"
  const collapsed = base.replace(/\(([^)]*)\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!forms.includes(collapsed)) forms.push(collapsed);

  for (const form of forms) {
    if (ALIASES[form] && INGREDIENTS[ALIASES[form]]) return INGREDIENTS[ALIASES[form]];
    if (INGREDIENTS[form]) return INGREDIENTS[form];
  }
  return null;
}

/* Turn a pasted INCI list into an array of trimmed names. */
export function parseIngredients(text) {
  if (!text) return [];
  return String(text)
    .replace(/^\s*ingredients?\s*[:\-]\s*/i, '')
    .replace(/\(and\)/gi, ',')
    .split(/[,\n;•]+/)
    .map(s => s.replace(/^\s*\d+[).]\s*/, '').replace(/\s+/g, ' ').trim())
    .map(s => s.replace(/[.\s]+$/, ''))
    .filter(Boolean);
}

/* Every tag present in a product's ingredient list. */
export function tagsFor(ingredients = []) {
  const set = new Set();
  for (const name of ingredients) {
    const entry = lookup(name);
    if (entry) entry.t.forEach(t => set.add(t));
  }
  return set;
}

/* Weight by position: what appears early is present in quantity. */
export function weightedTags(ingredients = []) {
  const weights = new Map();
  const n = ingredients.length || 1;
  ingredients.forEach((name, i) => {
    const entry = lookup(name);
    if (!entry) return;
    const pos = i / n;
    const w = pos < 0.34 ? 1 : pos < 0.67 ? 0.6 : 0.3;
    for (const tag of entry.t) {
      weights.set(tag, Math.max(weights.get(tag) || 0, w));
    }
  });
  return weights;
}

export const activesIn = ingredients =>
  ACTIVE_TAGS.filter(t => tagsFor(ingredients).has(t));

export const flagsIn = ingredients =>
  FLAG_TAGS.filter(t => tagsFor(ingredients).has(t));
