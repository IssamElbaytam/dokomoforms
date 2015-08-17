//XXX Set on init
revisit_url = "";

var React = require('react');
var $ = require('jquery');
var PouchDB  = require('pouchdb');
PouchDB.plugin(require('pouchdb-upsert'));

var ResponseField = require('./components/baseComponents/ResponseField.js');
var ResponseFields = require('./components/baseComponents/ResponseFields.js');
var BigButton = require('./components/baseComponents/BigButton.js');
var LittleButton = require('./components/baseComponents/LittleButton.js');
var DontKnow = require('./components/baseComponents/DontKnow.js');

var Title = require('./components/baseComponents/Title.js');
var Card = require('./components/baseComponents/Card.js');
var Select = require('./components/baseComponents/Select.js');
var FacilityRadios = require('./components/baseComponents/FacilityRadios.js');
var Message = require('./components/baseComponents/Message.js');

var Header = require('./components/Header.js');
var Footer = require('./components/Footer.js');
var Question = require('./components/Question.js'); 
var Note = require('./components/Note.js'); 

var MultipleChoice = require('./components/MultipleChoice.js'); 
var Photo = require('./components/Photo.js'); 
var Location = require('./components/Location.js'); 
var Facility = require('./components/Facility.js'); 
var Submit = require('./components/Submit.js'); 
var Splash = require('./components/Splash.js'); 

var PhotoAPI = require('./PhotoAPI.js');
var FacilityTree = require('./FacilityAPI.js');

/* 
 * Create Single Page App with three main components
 * Header, Content, Footer
 */
var Application = React.createClass({
    getInitialState: function() {
        var trees = {};
        window.trees = trees;
        var nyc = {lat: 40.80690, lng:-73.96536}
        window.nyc = nyc;
        
        var surveyDB = new PouchDB(this.props.survey.id, {
                    'auto_compation': true,
        });

        // Build initial linked list and dictionary of facility trees
        //TODO: Facility trees for sub surveys!!
        var questions = this.props.survey.nodes;
        var first_question = null;
        questions.forEach(function(node, idx) {
            var question = node;
            question.prev = null;
            question.next = null;
            if (idx > 0) {
                question.prev = questions[idx - 1];
            }

            if (idx < questions.length - 1) {
                question.next = questions[idx + 1];
            }

            if (idx === 0) {
                first_question = question;
            }

            if (node.type_constraint === 'facility') {
                console.log(node.logic);
                console.log(node);
                trees[node.id] = new FacilityTree(
                        parseFloat(node.logic.nlat), 
                        parseFloat(node.logic.wlng), 
                        parseFloat(node.logic.slat), 
                        parseFloat(node.logic.elng),
                        surveyDB);
            }
        });

        window.surveyDB = surveyDB;

        return { 
            showDontKnow: false,
            showDontKnowBox: false,
            head: first_question,
            question: null,
            headStack: [], //XXX Stack of linked list heads
            states : {
                SPLASH : 1,
                QUESTION : 2,
                SUBMIT : 3,
            },
            state: 1,
            trees: trees,
            db: surveyDB
        }
    },

    /*
     * Load next question, updates state of the Application
     * if next question is not found move to either SPLASH/SUBMIT
     */
    onNextButton: function() {
        var self = this;
        var surveyID = this.props.survey.id;
        var currentState = this.state.state;
        var currentQuestion = this.state.question;

        // Set up next state
        var nextQuestion = null;
        var showDontKnow = false;
        var showDontKnowBox = false;
        var state = this.state.states.SPLASH;
        var head = this.state.head;
        var headStack = this.state.headStack;

        console.log("Current Question", currentQuestion);

        switch(currentState) {
            // On Submit page and next was pressed
            case this.state.states.SUBMIT:
                nextQuestion = null;
                showDontKnow = false;
                showDontKnowBox = false;
                state = this.state.states.SPLASH
                //XXX Fire Modal for submitting here
                this.onSave();
                break;

            // On Splash page and next was pressed
            case this.state.states.SPLASH:
                nextQuestion = this.state.head;
                showDontKnow = nextQuestion.allow_dont_know || false;
                showDontKnowBox = false;
                state = this.state.states.QUESTION

                var questionID = nextQuestion.id;
                if (showDontKnow) { 
                    var response = this.refs.footer.getAnswer(questionID);
                    console.log("Footer response:", response);
                    showDontKnowBox = Boolean(response);
                }

                break;

            case this.state.states.QUESTION:
                // Look into active answers, check if any filled out if question is REQUIRED
                var required = currentQuestion.required || false;
                if (required) {
                    var questionID = currentQuestion.id;
                    var survey = JSON.parse(localStorage[surveyID] || '{}');
                    var answers = (survey[questionID] || []).filter(function(response) {
                        return (response && response.response !== null);
                    });

                    console.log("Responses to required question:", answers);

                    if (!answers.length) {
                        alert("Valid response is required.");
                        return;
                    }
                }
                
                /* Branching question */

                // Get answer
                var questionID = currentQuestion.id;
                var survey = JSON.parse(localStorage[surveyID] || '{}');
                var answers = (survey[questionID] || []).filter(function(response) {
                    return (response && response.response !== null);
                });

                // XXX Confirm response type is answer (instead of dont-know/other)
                var answer = answers.length && answers[0].response || null;
                var sub_surveys = currentQuestion.sub_surveys;

                // If has subsurveys then it can branch
                if (sub_surveys) {
                    console.log("Subsurveys:", currentQuestion.id, sub_surveys);
                    console.log("Answer:", answer);

                    // Check which subsurvey this answer buckets into
                    sub_surveys.forEach(function(sub) {
                        console.log("Bucket:", sub.buckets, "Type:", currentQuestion.type_constraint);
                        console.log("currentQuestion:", currentQuestion.next.id);
                        console.log("currentQuestion:", currentQuestion.prev.id);

                        // Append all subsurveys to clone of current question, update head, update headStack if in bucket
                        var inBee = self.inBucket(sub.buckets, currentQuestion.type_constraint, answer);
                        if (inBee) {
                            // Clone current element
                            var clone = self.cloneNode(currentQuestion);
                            var temp = clone.next;

                            // link sub nodes
                            for (var i = 0; i < sub.nodes.length; i++) {
                                if (i == 0) {
                                    clone.next = sub.nodes[i];
                                    sub.nodes[i].prev = clone;
                                } else {
                                    sub.nodes[i].prev = sub.nodes[i - 1];;
                                }

                                if (i === sub.nodes.length - 1) {
                                    sub.nodes[i].next = temp;
                                    temp.prev = sub.nodes[i];
                                } else { 
                                    sub.nodes[i].next = sub.nodes[i + 1];
                                }
                            }

                            // Always add branchable questions previous state into headStack
                            headStack.push(currentQuestion);

                            // Find the head
                            var newHead = clone;
                            while(newHead.prev) {
                                newHead = newHead.prev;
                            }
                            head = newHead;

                            // Set current question to CLONE always
                            currentQuestion = clone;

                            return false; // break
                        }

                    });

                }

                nextQuestion = currentQuestion.next;
                state = this.state.states.QUESTION

                // Set the state to SUBMIT when reach the end of questions
                if (nextQuestion === null) {
                    nextQuestion = currentQuestion; //Keep track of tail
                    showDontKnow = false;
                    showDontKnowBox = false;
                    state = this.state.states.SUBMIT;
                    break;
                }

                // Moving into a valid question
                showDontKnow = nextQuestion.allow_dont_know || false;
                showDontKnowBox = false;
                var questionID = nextQuestion.id;

                if (showDontKnow) { 
                    var response = this.refs.footer.getAnswer(questionID);
                    console.log("Footer response:", response);
                    showDontKnowBox = Boolean(response);
                }

                break;

        }

        this.setState({
            question: nextQuestion,
            showDontKnow: showDontKnow,
            showDontKnowBox: showDontKnowBox,
            head: head,
            headStack: headStack,
            state: state
        })

        return;

    },

    /*
     * Load prev question, updates state of the Application
     * if prev question is not found to SPLASH
     */
    onPrevButton: function() {
        var self = this;
        var surveyID = this.props.survey.id;
        var currentState = this.state.state;
        var currentQuestion = this.state.question;

        // Set up next state
        var nextQuestion = null;
        var showDontKnow = false;
        var showDontKnowBox = false;
        var state = this.state.states.SPLASH;
        var head = this.state.head;
        var headStack = this.state.headStack;

        switch(currentState) {
            // On Submit page and prev was pressed
            case this.state.states.SUBMIT:
                nextQuestion = currentQuestion; // Tail was saved in current question

                // Branching ONLY happens when moving BACK into branchable question
                // Rare but can happen on question that either leads to submit or more questions
                var sub_surveys = nextQuestion.sub_surveys;
                if (sub_surveys && headStack.length) {
                    // If he's in the branched stack, pop em off
                    if (headStack[headStack.length - 1].id === nextQuestion.id) {
                        console.log("RESETING", nextQuestion.id, headStack.length);
                        // Reset the nextQuestion to previously unbranched state
                        nextQuestion = headStack.pop();
                        console.log("RESET", nextQuestion.id, headStack.length);
                        // Find the head
                        var newHead = nextQuestion;
                        while(newHead.prev) {
                            newHead = newHead.prev;
                        }
                        head = newHead;
                    }
                }


                showDontKnow = currentQuestion.allow_dont_know || false;
                showDontKnowBox = false;
                state = this.state.states.QUESTION

                var questionID = currentQuestion.id;
                if (showDontKnow) { 
                    var response = this.refs.footer.getAnswer(questionID);
                    console.log("Footer response:", response);
                    showDontKnowBox = Boolean(response);
                }
                break;

            // On Splash page and prev was pressed (IMPOSSIBLE)
            case this.state.states.SPLASH:
                nextQuestion = null;
                showDontKnowBox = false;
                showDontKnow = false;
                state = this.state.states.SPLASH
                break;

            case this.state.states.QUESTION:
                nextQuestion = currentQuestion.prev;
                state = this.state.states.QUESTION

                // Set the state to SUBMIT when reach the end of questions
                if (nextQuestion === null) {
                    nextQuestion = currentQuestion;
                    showDontKnow = false;
                    showDontKnowBox = false;
                    state = this.state.states.SPLASH;
                    break;
                }

                // Branching ONLY happens when moving BACK into branchable question
                var sub_surveys = nextQuestion.sub_surveys;
                if (sub_surveys && headStack.length) {
                    // If he's in the branched stack, pop em off
                    if (headStack[headStack.length - 1].id === nextQuestion.id) {
                        console.log("RESETING", nextQuestion.id, headStack.length);
                        // Reset the nextQuestion to previously unbranched state
                        nextQuestion = headStack.pop();
                        console.log("RESET", nextQuestion.id, headStack.length);
                        // Find the head
                        var newHead = nextQuestion;
                        while(newHead.prev) {
                            newHead = newHead.prev;
                        }
                        head = newHead;
                    }
                }


                // Moving into a valid question
                showDontKnow = nextQuestion.allow_dont_know || false;
                showDontKnowBox = false;
                var questionID = nextQuestion.id;

                if (showDontKnow) { 
                    var response = this.refs.footer.getAnswer(questionID);
                    console.log("Footer response:", response);
                    showDontKnowBox = Boolean(response);
                }

                break;

        }

        this.setState({
            question: nextQuestion,
            showDontKnow: showDontKnow,
            showDontKnowBox: showDontKnowBox,
            head: head,
            headStack: headStack,
            state: state
        })

        return;

    },

    // Check if response is in bucket
    inBucket: function(buckets, type, response) {
        if (response === null) 
            return false;

        switch(type) {
            case "integer":
            case "decimal":
                var inBee = 1; // Innocent untill proven guilty
                buckets.forEach(function(bucket) {
                    var left = bucket.split(',')[0];
                    var right = bucket.split(',')[1];
                    console.log(response, inBee);
                    if (left[0] === "[") {
                        console.log("Inclusive Left");
                        inBee &= (response >= parseFloat(left.split("[")[1]));
                        console.log(response, inBee, left.split("[")[1]);
                    } else if (left[0] === "(") {
                        console.log("Exclusive Left");
                        inBee &= (response > parseFloat(left.split("(")[1]))
                    } else {
                        inBee = 0;
                    }

                    if (right[right.length - 1] === "]") {
                        inBee &= (response <= parseFloat(right.split("]")[0]))
                        console.log("Inclusive Right");
                    } else if (right[right.length - 1] === ")") {
                        inBee &= (response < parseFloat(right.split(")")[0]))
                        console.log("Exclusive Right");
                        console.log(response, inBee, right.split(")")[0]);
                    } else {
                        inBee = 0; // unknown
                    }

                    if (inBee) 
                        return false; //break
                });

                console.log(response, inBee);
                return inBee;
            case "date":
                return false;
            case 'timestamp': 
                return false;
            case 'multiple_choice': 
                return false;
            default:
                return false;

        }
    },

    // Clone linked list node, arrays don't need to be cloned, only next/prev ptrs
    cloneNode: function(node, ids) {
        var self = this;
        var clone = {
            next: null,
            prev: null
        };

        ids = ids || {};

        Object.keys(node).forEach(function(key) {
            if (key != 'next' && key != 'prev') {
                clone[key] = node[key]
            }
        });

       // Should be mutable ...
       ids[node.id] = clone;

       if (node.next) {
           var next = ids[node.next.id];
           clone.next = next || self.cloneNode(node.next, ids);
       }

       if (node.prev) {
           var prev = ids[node.prev.id];
           clone.prev = prev || self.cloneNode(node.prev, ids);
       }

        return clone;
    },

    /*
     * Save active survey into unsynced array 
     */
    onSave: function() {
        var survey = JSON.parse(localStorage[this.props.survey.id] || '{}');
        // Get all unsynced surveys
        var unsynced_surveys = JSON.parse(localStorage['unsynced'] || '{}');
        // Get array of unsynced submissions to this survey
        var unsynced_submissions = unsynced_surveys[this.props.survey.id] || [];
        // Get array of unsynced photo id's
        var unsynced_photos = JSON.parse(localStorage['unsynced_photos'] || '[]');
        // Get array of unsynced facilities
        var unsynced_facilities = JSON.parse(localStorage['unsynced_facilities'] || '[]');

        // Build new submission
        var answers = []; 
        var self = this;
        this.props.survey.nodes.forEach(function(question) {
            var responses = survey[question.id] || [];
            responses.forEach(function(response) {
                // Ignore empty responses
                if (!response || response.response === null) {
                    return true; // continue;
                }

                // Photos need to synced independantly from survey
                if (question.type_constraint === 'photo') {
                   unsynced_photos.push({
                       'surveyID': self.props.survey.id,
                       'photoID': response.response,
                       'questionID': question.id
                   });
                }

                // New facilities need to be stored seperatly from survey
                if (question.type_constraint === 'facility') {
                    console.log("Facility:", response);
                    if (response.metadata && response.metadata.is_new) {
                        console.log("Adding new facility data");
                        self.state.trees[question.id]
                            .addFacility(response.response.lat, response.response.lng, response.response);

                        console.log("Storing facility in unsynced array");
                        unsynced_facilities.push({
                            'surveyID': self.props.survey.id,
                            'facilityData': response.response,
                            'questionID': question.id
                        });
                    } 
                }

                answers.push({
                    survey_node_id: question.id,
                    response: response,
                    type_constraint: question.type_constraint
                });
            });

        });

        // Don't record it if there are no answers, will mess up splash 
        if (answers.length === 0) {
            return;
        }

        var submission = {
            submitter_name: localStorage['submitter_name'] || "anon",
            submitter_email: localStorage['submitter_email'] || "anon@anon.org",
            submission_type: "unauthenticated", //XXX 
            survey_id: this.props.survey.id,
            answers: answers,
            save_time: new Date().toISOString(),
            submission_time: "" // For comparisions during submit ajax callback
        }

        console.log("Submission", submission);

        // Record new submission into array
        unsynced_submissions.push(submission);
        unsynced_surveys[this.props.survey.id] = unsynced_submissions;
        localStorage['unsynced'] = JSON.stringify(unsynced_surveys);

        // Store photos 
        localStorage['unsynced_photos'] = JSON.stringify(unsynced_photos);

        // Store facilities
        localStorage['unsynced_facilities'] = JSON.stringify(unsynced_facilities);

        // Wipe active survey
        localStorage[this.props.survey.id] = JSON.stringify({});

        // Wipe location info
        localStorage['location'] = JSON.stringify({});
    },

    /*
     * Loop through unsynced submissions for active survey and POST
     * Only modifies localStorage on success
     */
    onSubmit: function() {
        function getCookie(name) {
            var r = document.cookie.match("\\b" + name + "=([^;]*)\\b");
            return r ? r[1] : undefined;
        }
        
        var self = this;

        // Get all unsynced surveys
        var unsynced_surveys = JSON.parse(localStorage['unsynced'] || '{}');
        // Get array of unsynced submissions to this survey
        var unsynced_submissions = unsynced_surveys[this.props.survey.id] || [];
        // Get all unsynced photos.
        var unsynced_photos = JSON.parse(localStorage['unsynced_photos'] || '[]');
        // Get all unsynced facilities
        var unsynced_facilities = JSON.parse(localStorage['unsynced_facilities'] || '[]');

        // Post surveys to Dokomoforms
        unsynced_submissions.forEach(function(survey) {
            // Update submit time
            survey.submission_time = new Date().toISOString();
            $.ajax({
                url: '/api/v0/surveys/'+survey.survey_id+'/submit',
                type: 'POST',
                contentType: 'application/json',
                processData: false,
                data: JSON.stringify(survey),
                headers: {
                    "X-XSRFToken": getCookie("_xsrf")
                },
                dataType: 'json',
                success: function(survey, anything, hey) {
                    console.log("success", anything, hey);
                    // Get all unsynced surveys
                    var unsynced_surveys = JSON.parse(localStorage['unsynced'] || '{}');
                    // Get array of unsynced submissions to this survey
                    var unsynced_submissions = unsynced_surveys[survey.survey_id] || [];

                    // Find unsynced_submission
                    var idx = -1;
                    unsynced_submissions.forEach(function(usurvey, i) {
                        if (Date(usurvey.save_time) === Date(survey.save_time)) {
                            idx = i;
                            return false;
                        }
                        return true;
                    });

                    // Not sure what happened, do not update localStorage
                    if (idx === -1) 
                        return;

                    console.log(idx, unsynced_submissions.length);
                    unsynced_submissions.splice(idx, 1);

                    unsynced_surveys[survey.survey_id] = unsynced_submissions;
                    localStorage['unsynced'] = JSON.stringify(unsynced_surveys);

                    // Update splash page if still on it
                    if (self.state.state === self.state.states.SPLASH)
                        self.refs.splash.update();
                },

                error: function(err) {
                    console.log("Failed to post survey", err, survey);
                }
            });

            console.log('synced submission:', survey);
            console.log('survey', '/api/v0/surveys/'+survey.survey_id+'/submit');
        });

        // Post photos to dokomoforms
        unsynced_photos.forEach(function(photo, idx) {
            if (photo.surveyID === self.props.survey.id) {
                PhotoAPI.getBase64(self.state.db, photo.photoID, function(err, base64){
                    $.ajax({
                        url: '/api/v0/photos',
                        type: 'POST',
                        contentType: 'application/json',
                        processData: false,
                        data: JSON.stringify({
                            'id' : photo.photoID,
                            'mime_type': 'image/png',
                            'image': base64
                        }),
                        headers: {
                            "X-XSRFToken": getCookie("_xsrf")
                        },
                        dataType: 'json',
                        success: function(photo) {
                            console.log("Photo success:", photo);
                            var unsynced_photos = JSON.parse(localStorage['unsynced_photos'] || '[]');
                            // Find photo
                            var idx = -1;
                            unsynced_photos.forEach(function(uphoto, i) {
                                if (uphoto.photoID === photo.id) {
                                    idx = i;
                                    PhotoAPI.removePhoto(self.state.db, uphoto.photoID, function(err, result) {
                                        if (err) {
                                            console.log("Couldnt remove from db:", err);
                                            return;
                                        }
                                        console.log("Removed:", result);
                                    });
                                    return false;
                                }
                                return true;
                            });

                            // What??
                            if (idx === -1)
                                return;

                            console.log(idx, unsynced_photos.length);
                            unsynced_photos.splice(idx, 1);

                            localStorage['unsynced_photos'] = JSON.stringify(unsynced_photos);
                        },

                        error: function(err) {
                            console.log("Failed to post photo:", err, photo);
                        }
                    });
                });
            }
        });
        
        // Post facilities to Revisit
        unsynced_facilities.forEach(function(facility, idx) {
            if (facility.surveyID === self.props.survey.id) {
                self.state.trees[facility.questionID].postFacility(facility.facilityData, 
                    // Success
                    function(revisitFacility) {
                        console.log("Successfully posted facility", revisitFacility, facility); 
                        var unsynced_facilities = JSON.parse(localStorage['unsynced_facilities'] || '[]');

                        // Find facility
                        var idx = -1;
                        console.log(idx, unsynced_facilities.length);
                        unsynced_facilities.forEach(function(ufacility, i) {
                            var ufacilityID = ufacility.facilityData.facility_id;
                            var facilityID = facility.facilityData.facility_id;
                            if (ufacilityID === facilityID) {
                                idx = i;
                                return false;
                            }
                            return true;
                        });

                        // What??
                        if (idx === -1)
                            return;

                        console.log(idx, unsynced_facilities.length);
                        unsynced_facilities.splice(idx, 1);

                        localStorage['unsynced_facilities'] = JSON.stringify(unsynced_facilities);
                    },

                    // Error
                    function(revisitFacility) {
                        console.log("Failed to post facility", err, facility); 
                    }
                );
            }
        });
    },


    /*
     * Respond to don't know checkbox event, this is listend to by Application
     * due to app needing to resize for the increased height of the don't know
     * region
     */
    onCheckButton: function() {
        this.setState({
            showDontKnowBox: this.state.showDontKnowBox ? false: true,
            showDontKnow: this.state.showDontKnow,
        });

        // Force questions to update
        if (this.state.state = this.state.states.QUESTION)
            this.refs.question.update();

    },

    /*
     * Load the appropiate question based on the nextQuestion state
     * Loads splash or submit content if state is either SPLASH/SUBMIT 
     */
    getContent: function() {
        var questions = this.props.survey.nodes;
        var question = this.state.question;
        var state = this.state.state;
        var survey = this.props.survey;

        if (state === this.state.states.QUESTION) {
            var questionID = question.id;
            var questionType = question.type_constraint;
            switch(questionType) {
                case 'multiple_choice':
                    return (
                            <MultipleChoice 
                                ref="question"
                                key={questionID} 
                                question={question} 
                                questionType={questionType}
                                language={survey.default_language}
                                surveyID={survey.id}
                                disabled={this.state.showDontKnowBox}
                           />
                       )
                case 'photo':
                    return (
                            <Photo
                                ref="question"
                                key={questionID} 
                                question={question} 
                                questionType={questionType}
                                language={survey.default_language}
                                surveyID={survey.id}
                                disabled={this.state.showDontKnowBox}
                                db={this.state.db}
                           />
                       )

                case 'location':
                    return (
                            <Location
                                ref="question"
                                key={questionID} 
                                question={question}
                                questionType={questionType}
                                language={survey.default_language}
                                surveyID={survey.id}
                                disabled={this.state.showDontKnowBox}
                           />
                       )
                case 'facility':
                    return (
                            <Facility
                                ref="question"
                                key={questionID} 
                                question={question} 
                                questionType={questionType}
                                language={survey.default_language}
                                surveyID={survey.id}
                                disabled={this.state.showDontKnowBox}
                                db={this.state.db}
                                tree={this.state.trees[questionID]}
                           />
                       )
                case 'note':
                    return (
                            <Note
                                ref="question"
                                key={questionID} 
                                question={questions}
                                questionType={questionType}
                                language={survey.default_language}
                                surveyID={survey.id}
                                disabled={this.state.showDontKnowBox}
                           />
                       )
                default:
                    return (
                            <Question 
                                ref="question"
                                key={questionID} 
                                question={question} 
                                questionType={questionType}
                                language={survey.default_language}
                                surveyID={survey.id}
                                disabled={this.state.showDontKnowBox}
                           />
                       )
            }
        } else if (state === this.state.states.SUBMIT) {
            return (
                    <Submit
                        ref="submit"
                        surveyID={survey.id}
                        language={survey.default_language}
                    />
                   )
        } else {
            return (
                    <Splash 
                        ref="splash"
                        surveyID={survey.id}
                        surveyTitle={survey.title}
                        language={survey.default_language}
                        buttonFunction={this.onSubmit}
                    />
                   )
        }
    },

    /*
     * Load the appropiate title based on the question and state
     */
    getTitle: function() {
        var questions = this.props.survey.nodes;
        var survey = this.props.survey;
        var question = this.state.question;
        var state = this.state.state;

        if (state === this.state.states.QUESTION) {
            return question.title[survey.default_language] 
        } else if (state === this.state.states.SUBMIT) {
            return "Ready to Save?"
        } else {
            return survey.title[survey.default_language] 
        }
    },

    /*
     * Load the appropiate 'hint' based on the question and state
     */
    getMessage: function() {
        var questions = this.props.survey.nodes;
        var survey = this.props.survey;
        var question = this.state.question;
        var state = this.state.state;

        if (state === this.state.states.QUESTION) {
            return question.hint[survey.default_language] 
        } else if (state === this.state.states.SUBMIT) {
            return "If youre satisfied with the answers to all the questions, you can save the survey now."
        } else {
            return "version " + survey.version + " | last updated " + survey.last_updated_time;
        }
    },

    /*
     * Load the appropiate text in the Footer's button based on state
     */
    getButtonText: function() {
        var state = this.state.state;
        if (state === this.state.states.QUESTION) {
            return "Next Question";
        } else if (state === this.state.states.SUBMIT) {
            return "Save Survey"
        } else {
            return "Begin a New Survey"
        }
    },

    render: function() {
        var contentClasses = "content";
        var state = this.state.state;
        var question = this.state.question;
        var questionID = question && question.id || -1;
        var surveyID = this.props.survey.id;

        // Get current length of survey and question number
        var number = -1;
        var length = 0;
        var head = this.state.head;
        while(head) {
            if (head.id === questionID) {
                number = length;
            }

            head = head.next;
            length++;
        } 


        // Alter the height of content based on DontKnow state
        if (this.state.showDontKnow) 
            contentClasses += " content-shrunk";

        if (this.state.showDontKnowBox) 
            contentClasses += " content-shrunk content-super-shrunk";

        return (
                <div id="wrapper">
                    <Header 
                        ref="header"
                        buttonFunction={this.onPrevButton} 
                        number={number + 1}
                        total={length + 1}
                        db={this.state.db}
                        surveyID={surveyID}
                        splash={state === this.state.states.SPLASH}/>
                    <div 
                        className={contentClasses}>
                        <Title title={this.getTitle()} message={this.getMessage()} />
                        {this.getContent()}
                    </div>
                    <Footer 
                        ref="footer"
                        showDontKnow={this.state.showDontKnow} 
                        showDontKnowBox={this.state.showDontKnowBox} 
                        buttonFunction={this.onNextButton}
                        checkBoxFunction={this.onCheckButton}
                        buttonType={state === this.state.states.QUESTION 
                            ? 'btn-primary': 'btn-positive'}
                        buttonText={this.getButtonText()}
                        questionID={questionID}
                        surveyID={surveyID}
                     />

                </div>
               )
    }
});

init = function(survey, url) {
    // Set revisit url
    revisit_url = url;

    // Listen to appcache updates, reload JS.
    window.applicationCache.addEventListener('updateready', function() {
        alert("Application updated, reloading ...");
        window.applicationCache.swapCache()
        window.location.reload();
    });

    React.render(
            <Application survey={survey}/>,
            document.body
    );
};
