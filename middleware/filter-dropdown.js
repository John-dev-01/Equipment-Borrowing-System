const { esc } = require('./views');

function filterDropdown(name, label, selected, choices) {
  const id = `filter-${name}-options`;
  const current = choices.find(choice => choice.value === selected) || choices[0];
  return `<label>${esc(label)}<div class="department-select filter-select has-value" data-department-select>
    <input type="hidden" name="${esc(name)}" value="${esc(selected)}" data-department-value>
    <button class="department-select-trigger" type="button" data-department-trigger role="combobox" aria-label="Filter by ${esc(label.toLowerCase())}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}">
      <span data-department-label>${esc(current.label)}</span><span class="department-select-chevron" aria-hidden="true"></span>
    </button>
    <div class="department-select-menu" id="${id}" data-department-options role="listbox" aria-label="${esc(label)} options" hidden>
      ${choices.map(choice => `<button type="button" class="department-option" data-department-option data-value="${esc(choice.value)}" role="option" aria-selected="${choice.value === selected}">${esc(choice.label)}</button>`).join('')}
    </div>
  </div></label>`;
}

module.exports = filterDropdown;
