const libFableServiceProviderBase = require('fable-serviceproviderbase');
/**
* Date management a la Moment using days.js
*
* @class DateManipulation
*/
class DateManipulation extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash)

		this.serviceType = 'Dates';

		this.dayJS = require('dayjs');

		// Include the `weekOfYear` plugin
		this.plugin_weekOfYear = require('dayjs/plugin/weekOfYear');
		this.dayJS.extend(this.plugin_weekOfYear);
		// Include the `weekday` plugin
		this.plugin_weekday = require('dayjs/plugin/weekday');
		this.dayJS.extend(this.plugin_weekday);
		// Include the `isoWeek` plugin
		this.plugin_isoWeek = require('dayjs/plugin/isoWeek');
		this.dayJS.extend(this.plugin_isoWeek);
		// Include the `timezone` plugin
		this.plugin_timezone = require('dayjs/plugin/timezone');
		this.dayJS.extend(this.plugin_timezone);
		// Include the `relativetime` plugin
		this.plugin_relativetime = require('dayjs/plugin/relativeTime');
		this.dayJS.extend(this.plugin_relativetime);
		// Include the `utc` plugin
		this.plugin_utc = require('dayjs/plugin/utc');
		this.dayJS.extend(this.plugin_utc);
		// Include the `advancedFormat` plugin
		this.plugin_advancedFormat = require('dayjs/plugin/advancedFormat');
		this.dayJS.extend(this.plugin_advancedFormat);

		// A developer can include locales if they want
		// You would do the following:
		// const localeDE = require('dayjs/locale/de');
		// _Fable.Dates.dayJS.locale('de');
	}

	/**
	 * Calculates the difference in milliseconds between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in milliseconds between the start and end dates. Returns NaN if the start date is invalid.
	 */
	dateMillisecondDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'millisecond');
	}

	/**
	 * Calculates the difference in seconds between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in seconds between the start and end dates. Returns NaN if the start date is invalid.
	 */
	dateSecondDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'second');
	}

	/**
	 * Calculates the difference in minutes between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in minutes between the start and end dates. Returns NaN if the start date is invalid.
	 */
	dateMinuteDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'minute');
	}

	/**
	 * Calculates the difference in hours between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in hours between the start and end dates. Returns NaN if the start date is invalid.
	 */
	dateHourDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'hour');
	}

	/**
	 * Calculates the difference in days between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in days between the start and end dates. Returns NaN if the start date is invalid.
	 */
	dateDayDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'day');
	}

	/**
	 * Calculates the difference in weeks between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in weeks between the two dates. Returns NaN if the start date is invalid.
	 */
	dateWeekDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'week');
	}

	/**
	 * Calculates the difference in months between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in months between the two dates. Returns NaN if the start date is invalid.
	 */
	dateMonthDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'month');
	}

	/**
	 * Calculates the difference in years between two dates.
	 *
	 * @param {string|Date|number} pDateStart - The start date. Can be a string, Date object, or timestamp.
	 * @param {string|Date|number} pDateEnd - The end date. Can be a string, Date object, or timestamp. Defaults to the current date if not provided.
	 * @param {boolean} pRequireEndDate - If true, the end date must be provided; otherwise, it defaults to the current date.
	 * @returns {number} The difference in years between the two dates. Returns NaN if the start date is invalid.
	 */
	dateYearDifference(pDateStart, pDateEnd, pRequireEndDate = false)
	{
		if ((pDateStart === undefined) || (pDateStart === null) || (pDateStart === ''))
		{
			return NaN;
		}
		if ((pRequireEndDate || (pRequireEndDate == 1) || (pRequireEndDate == '1')) && ((pDateEnd === undefined) || (pDateEnd === null) || (pDateEnd === '')))
		{
			return NaN;
		}
		let tmpStartDate = this.dayJS(pDateStart);
		let tmpEndDate = this.dayJS(pDateEnd);
		return tmpEndDate.diff(tmpStartDate, 'year');
	}

	dateAddMilliseconds(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'millisecond', 'add');
	}

	dateAddSeconds(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'second', 'add');
	}

	dateAddMinutes(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'minute', 'add');
	}

	dateAddHours(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'hour', 'add');
	}

	dateAddDays(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'day', 'add');
	}

	dateAddWeeks(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'week', 'add');
	}

	dateAddMonths(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'month', 'add');
	}

	dateAddYears(pDate, pAmount)
	{
		return this.dateMath(pDate, pAmount, 'year', 'add');
	}

	dateMath(pDate, pAmount, pUnit, pOperation)
	{
		try
		{
			let tmpDate = this.dayJS.utc(pDate);

			if (pOperation === 'add')
			{
				tmpDate = tmpDate.add(pAmount, pUnit);
			}
			else if (pOperation === 'subtract')
			{
				tmpDate = tmpDate.subtract(pAmount, pUnit);
			}
			return this.dayJS.utc(tmpDate).toISOString();
		}
		catch (pError)
		{
			return undefined;
		}
	}

	/**
	 * Format a date value with dayjs format tokens, rendered in a timezone.
	 *
	 * Timezone resolution: the explicit parameter wins; otherwise the
	 * dayjs default set via `dayJS.tz.setDefault(...)` (the host
	 * application's configured timezone — e.g. pict apps set this to the
	 * document's project timezone); otherwise the host's local zone.
	 *
	 * @param {string|number|Date} pDateValue - ISO string, epoch millis, or Date
	 * @param {string} pFormat - dayjs format tokens (e.g. 'YYYY-MM-DD h:mm A')
	 * @param {string} [pTimezone] - optional IANA zone override (e.g. 'America/Chicago')
	 * @return {string|undefined} the formatted string, or undefined on an unparseable value
	 */
	formatDate(pDateValue, pFormat, pTimezone)
	{
		try
		{
			let tmpDate = this.dayJS(pDateValue);
			if (!tmpDate.isValid())
			{
				return undefined;
			}
			let tmpFormat = (typeof (pFormat) === 'string' && pFormat.length > 0) ? pFormat : 'YYYY-MM-DD HH:mm:ss';
			tmpDate = (typeof (pTimezone) === 'string' && pTimezone.length > 0) ? tmpDate.tz(pTimezone) : tmpDate.tz();
			return tmpDate.format(tmpFormat);
		}
		catch (pError)
		{
			return undefined;
		}
	}

	dateFromParts(pYear, pMonth, pDay, pHour = 0, pMinute = 0, pSecond = 0, pMillisecond = 0)
	{
		try
		{
			let tmpDate = this.dayJS.utc().year(pYear).month(pMonth - 1).date(pDay).hour(pHour).minute(pMinute).second(pSecond).millisecond(pMillisecond);
			return tmpDate.toISOString();
		}
		catch (pError)
		{
			return undefined;
		}
	}
}

module.exports = DateManipulation;
