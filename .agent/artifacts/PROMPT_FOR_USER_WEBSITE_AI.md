# 🌍 PROMPT FOR STUDENT/USER WEBSITE AI

## COPY THIS ENTIRE PROMPT TO THE USER WEBSITE AI

---

## TASK: Update the Course/Module UI to Match the Unified "World-ish" Design

Looking at your current UI (the carousel with 2022, 2023, 2024 years), it already looks great! Let's make some improvements to align with the unified design spec for consistency with the Admin website.

---

## 🎨 COLOR PALETTE TO USE

```css
:root {
  /* Primary */
  --primary: #3B82F6;
  --primary-light: #EFF6FF;
  --primary-dark: #1D4ED8;
  
  /* Backgrounds */
  --bg-main: #F8FAFC;
  --bg-card: #FFFFFF;
  --bg-muted: #F1F5F9;
  
  /* Text */
  --text-primary: #0F172A;
  --text-secondary: #64748B;
  --text-muted: #94A3B8;
  
  /* Accents */
  --accent-green: #10B981;
  --accent-amber: #F59E0B;
  --accent-red: #EF4444;
  --accent-purple: #8B5CF6;
}
```

---

## 🃏 CARD STYLING (World-ish Look)

Update your course/year cards with these styles:

```css
.world-card {
  background: white;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 24px;
  position: relative;
  
  /* Floating island shadow effect */
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 10px 20px -5px rgba(0, 0, 0, 0.05);
  
  transition: all 0.3s ease;
}

.world-card:hover {
  transform: translateY(-4px);
  box-shadow: 
    0 8px 16px -4px rgba(0, 0, 0, 0.1),
    0 20px 40px -10px rgba(0, 0, 0, 0.1);
}

/* Gradient accent on top (atmosphere effect) */
.world-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary), #60A5FA);
  border-radius: 16px 16px 0 0;
}
```

---

## 🎠 CAROUSEL IMPROVEMENTS

Your carousel already exists. Add these enhancements:

```css
/* Active card (center) - slightly larger */
.carousel-item.active {
  transform: scale(1.05);
  z-index: 10;
  border: 2px solid var(--primary);
}

/* Side cards - slightly faded */
.carousel-item.side {
  transform: scale(0.9);
  opacity: 0.7;
}

/* Navigation arrows - circular with soft shadow */
.carousel-arrow {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: white;
  border: 1px solid rgba(148, 163, 184, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.carousel-arrow:hover {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary);
}
```

---

## 📊 STATS ROW (Already looks good, just ensure consistency)

```css
.stat-card {
  background: white;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
}

.stat-icon {
  width: 40px;
  height: 40px;
  margin: 0 auto 12px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Icon background colors */
.stat-icon.blue { background: rgba(59, 130, 246, 0.1); }
.stat-icon.green { background: rgba(16, 185, 129, 0.1); }
.stat-icon.amber { background: rgba(245, 158, 11, 0.1); }
.stat-icon.red { background: rgba(239, 68, 68, 0.1); }
```

---

## 🏷️ PILL BADGE (Already have it)

```css
.universe-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 9999px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--primary);
}
```

---

## 🔄 PROGRESS BAR

```css
.progress-bar {
  height: 6px;
  background: var(--bg-muted);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-green), #34D399);
  border-radius: 9999px;
  transition: width 0.5s ease;
}

.progress-text {
  color: var(--accent-green);
  font-size: 12px;
  font-weight: 600;
  margin-top: 8px;
}
```

---

## 🌈 ICON BACKGROUNDS (Gradient Style)

For the book/module icons at the top of each card:

```css
.world-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

/* Different colors for different years/modules */
.world-icon.pink { 
  background: linear-gradient(135deg, #FCE7F3, #FDF2F8); 
}
.world-icon.blue { 
  background: linear-gradient(135deg, #DBEAFE, #EFF6FF); 
}
.world-icon.green { 
  background: linear-gradient(135deg, #D1FAE5, #ECFDF5); 
}
.world-icon.amber { 
  background: linear-gradient(135deg, #FEF3C7, #FFFBEB); 
}
```

---

## ✨ ANIMATIONS (Keep it lightweight)

```css
/* Fade up entrance */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-in {
  animation: fadeUp 0.4s ease-out forwards;
}

/* Stagger children */
.stagger-children > * {
  animation: fadeUp 0.4s ease-out forwards;
}
.stagger-children > *:nth-child(1) { animation-delay: 0.0s; }
.stagger-children > *:nth-child(2) { animation-delay: 0.1s; }
.stagger-children > *:nth-child(3) { animation-delay: 0.2s; }
.stagger-children > *:nth-child(4) { animation-delay: 0.3s; }
```

---

## 📋 CHECKLIST OF CHANGES

1. [ ] Update card styling with world-ish shadows and hover lift
2. [ ] Add gradient accent on top of cards (4px colored bar)
3. [ ] Ensure carousel has perspective/scale effect
4. [ ] Update progress bar to use green gradient
5. [ ] Use consistent border-radius (12px small, 16px large)
6. [ ] Apply the color palette CSS variables
7. [ ] Add subtle entrance animations

---

## 🎯 GOAL

Your UI already looks 80% there! These changes will:
- Add the "floating island" shadow effect
- Make cards lift on hover (world exploration feel)
- Ensure consistent colors with Admin panel
- Keep everything lightweight (CSS only, no heavy libraries)

The Admin website will match this EXACT same design language!
