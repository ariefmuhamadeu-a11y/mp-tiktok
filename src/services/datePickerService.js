import flatpickr from 'flatpickr';
import { Indonesian } from 'flatpickr/dist/l10n/id.js';
import 'flatpickr/dist/flatpickr.min.css';

const defaultOptions = {
    locale: Indonesian,
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd F Y',
    allowInput: true,
    disableMobile: true
};

export function initDatePickers(root = document) {
    return Array.from(root.querySelectorAll('[data-flatpickr]')).map((input) => {
        if (input._flatpickr) return input._flatpickr;

        const options = { ...defaultOptions };
        if (input.dataset.flatpickrMode) options.mode = input.dataset.flatpickrMode;
        if (input.dataset.flatpickrDateFormat) options.dateFormat = input.dataset.flatpickrDateFormat;
        if (input.dataset.flatpickrAltFormat) options.altFormat = input.dataset.flatpickrAltFormat;

        const emitChange = (selectedDates) => {
            input.dispatchEvent(new CustomEvent('flatpickrchange', {
                detail: { selectedDates }
            }));
        };

        const picker = flatpickr(input, options);
        picker.config.onChange.push(emitChange);
        return picker;
    });
}
