// pricing.js - Логика ценообразования

export function calculatePackages(intent, params = {}) {
  const { 
    duration = '1m', 
    platforms = ['air'], 
    hasCreative = false,
    videoLength = 30 
  } = params;

  let base = 0;
  
  // Базовые цены в зависимости от intent
  if (intent === 'placement') {
    // ТОЛЬКО размещение
    base = 100000;
  } else if (intent === 'production') {
    // ТОЛЬКО продакшн (без размещения)
    base = videoLength <= 30 ? 350000 : videoLength <= 60 ? 500000 : 800000;
  } else if (intent === 'film') {
    // Фильм (10-15 минут)
    base = videoLength <= 5 ? 800000 : 1200000;
  } else if (intent === 'combo') {
    // Продакшн + размещение
    const productionCost = videoLength <= 30 ? 350000 : videoLength <= 60 ? 500000 : 800000;
    const placementCost = 100000;
    base = productionCost + placementCost; // 450000 для 30 сек
  } else {
    // Дефолт: комбо
    base = 450000;
  }

  // Коэффициенты пакетов
  const packages = {
    S: { coef: 1.0, name: 'Старт', desc: 'Базовый охват, проверка гипотез' },
    M: { coef: 1.7, name: 'Оптимальный', desc: 'Лучшее соотношение цена/охват' },
    L: { coef: 2.4, name: 'Премиум', desc: 'Максимальный охват + бонусы' }
  };

  // Скидки
  let discount = 0;
  const discountReasons = [];

  // Скидка за комбо (продакшн + размещение)
  if (intent === 'combo' || (hasCreative && intent === 'placement')) {
    discount += 5;
    discountReasons.push('Продакшн + размещение: -5%');
  }

  // Скидка за длительный период
  if (duration === '3m' || duration === '6m') {
    discount += 7;
    discountReasons.push('Период ≥ 3 месяцев: -7%');
  }

  // Скидка за мультиплатформу
  if (platforms.length >= 3) {
    discount += 5;
    discountReasons.push('Мультиплатформа: -5%');
  }

  discount = Math.min(discount, 15); // Максимальная скидка 15%

  // Считаем пакеты
  const result = Object.entries(packages).map(([key, pkg]) => {
    const price = Math.round(base * pkg.coef);
    const finalPrice = Math.round(price * (1 - discount / 100));
    
    return {
      name: pkg.name,
      level: key,
      description: pkg.desc,
      price: price,
      finalPrice: finalPrice,
      discount: discount,
      savings: price - finalPrice
    };
  });

  return {
    packages: result,
    discount: discount,
    discountReasons: discountReasons
  };
}

export function formatPackages(packagesData) {
  const { packages, discount, discountReasons } = packagesData;
  
  let text = '';
  
  packages.forEach((pkg, i) => {
    const icon = ['🥉', '🥈', '🥇'][i];
    text += `${icon} **${pkg.name}** (${pkg.level})\n`;
    text += `${pkg.description}\n`;
    
    if (discount > 0) {
      text += `~~${pkg.price.toLocaleString('ru-RU')}₽~~ → **${pkg.finalPrice.toLocaleString('ru-RU')}₽**\n`;
      text += `💰 Экономия: ${pkg.savings.toLocaleString('ru-RU')}₽\n`;
    } else {
      text += `💰 **${pkg.finalPrice.toLocaleString('ru-RU')}₽**\n`;
    }
    
    text += '\n';
  });

  if (discount > 0 && discountReasons.length > 0) {
    text += `🎁 **Скидки применены:**\n`;
    discountReasons.forEach(r => text += `• ${r}\n`);
  }

  return text.trim();
}
