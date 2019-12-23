import { connect } from 'react-redux';
import { mapDispatchToProps } from '../actions';
import { LeftPane } from '../../components/LeftPane';
import { StateType } from '../reducer';

import { getQuery, getSearchResults, isSearching } from '../selectors/search';
import {
  getIntl,
  getIsSecondaryDevice,
  getRegionCode,
  getUserNumber,
} from '../selectors/user';
import { getLeftPaneLists, getShowArchived } from '../selectors/conversations';

// Workaround: A react component's required properties are filtering up through connect()
//   https://github.com/DefinitelyTyped/DefinitelyTyped/issues/31363

const mapStateToProps = (state: StateType) => {
  const showSearch = isSearching(state);

  const lists = showSearch ? undefined : getLeftPaneLists(state);
  const searchResults = showSearch ? getSearchResults(state) : undefined;

  return {
    ...lists,
    searchTerm: getQuery(state),
    regionCode: getRegionCode(state),
    ourNumber: getUserNumber(state),
    isSecondaryDevice: getIsSecondaryDevice(state),
    searchResults,
    showArchived: getShowArchived(state),
    i18n: getIntl(state),
  };
};

const smart = connect(mapStateToProps, mapDispatchToProps);

export const SmartLeftPane = smart(LeftPane);
