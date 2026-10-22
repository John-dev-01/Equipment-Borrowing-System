const byName = {
  'dslr camera': '/images/dslr-camera-card.jpg',
  projector: '/images/projector-card.jpg',
  'extension cord': '/images/extension-cord-card.jpg',
  laptop: '/images/laptop-card.jpg',
  tripod: '/images/tripod-card.jpg',
};
const byCategory = {
  media: '/images/dslr-camera-card.jpg',
  presentation: '/images/projector-card.jpg',
  electrical: '/images/extension-cord-card.jpg',
  computing: '/images/laptop-card.jpg',
};
function equipmentImage(item) {
  const custom = typeof item.image_url === 'string' ? item.image_url.trim() : '';
  if (custom) return custom;
  return byName[String(item.name || '').trim().toLowerCase()]
    || byCategory[String(item.category || '').trim().toLowerCase()]
    || '/images/equipment-placeholder.svg';
}
module.exports = equipmentImage;
